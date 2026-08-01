//! Located parse errors: a structural mistake carries the field path and,
//! for plain-struct inputs, the YAML line/column — instead of a bare
//! location-less serde message. Body/Item are internally-tagged enums, so
//! errors inside a body item truncate the path to `sections.body` and the
//! location degrades (see the `crate::parse` module doc); the serde MESSAGE
//! — naming the bad key and the expected fields — is the fix that lands.

use super::*;
use crate::error::CoreError;

/// The AA4 case: an author writes `key:`/`format:` on a table column, but
/// the wire wants `data: { key, format }`. The old bare error named no
/// alternative; now the message lists the expected fields (including
/// `data`) and the path points into the body.
#[test]
fn table_column_wrong_key_names_the_expected_fields() {
    let bad = r#"
sections:
  body:
    type: flow
    items:
      - type: table
        data: { key: items }
        columns:
          - key: name
            format: plain
"#;
    let err = parse_template(bad).expect_err("must reject");
    let CoreError::Located { path, message, .. } = &err else { panic!("{err:?}") };
    assert!(path.starts_with("sections.body"), "path: {path}");
    // The message names the offending key and the wire's real one.
    assert!(message.contains("key"), "message: {message}");
    assert!(message.contains("data"), "message: {message}");
}

/// The dropped `emptyBehavior: hide` (and any guessed value like
/// `show_empty`) reports the valid variants.
#[test]
fn dropped_empty_behavior_value_lists_the_variants() {
    let bad = r#"
sections:
  body:
    type: flow
    items:
      - type: table
        data: { key: items }
        columns: []
        emptyBehavior: show_empty
"#;
    let err = parse_template(bad).expect_err("must reject");
    let CoreError::Located { message, .. } = &err else { panic!("{err:?}") };
    assert!(message.contains("collapse"), "message: {message}");
    assert!(message.contains("reserve"), "message: {message}");
}

/// A top-level template key is a plain struct field, so its error keeps the
/// full path and an accurate line — the fully-working half of the feature.
#[test]
fn unknown_top_level_key_is_located_precisely() {
    let err =
        parse_template("bogusTop: 1\nsections:\n  body:\n    type: absolute\n    items: []\n")
            .expect_err("must reject");
    // `path` is the offending key verbatim, with an accurate line.
    let CoreError::Located { path, line, .. } = &err else { panic!("{err:?}") };
    assert_eq!(path, "bogusTop");
    assert_eq!(*line, 1);
}

/// A hostile document with a huge unknown enum value must not blow up the
/// error message: the echoed value is clipped at the `CoreError` boundary.
/// (A long value, not a long key — YAML caps simple keys at 1024 chars and
/// would reject an oversized key at scan time instead.)
#[test]
fn hostile_unknown_value_message_is_bounded() {
    let huge = "z".repeat(900);
    let bad = format!(
        "sections:\n  body:\n    type: flow\n    items:\n      - type: table\n\
         \x20       data: {{ key: items }}\n        columns: []\n        emptyBehavior: {huge}\n"
    );
    let err = parse_template(&bad).expect_err("must reject");
    let CoreError::Located { message, .. } = &err else { panic!("{err:?}") };
    // Clipped to at most 200 chars + the ellipsis marker.
    assert!(
        message.chars().count() <= 201,
        "message not bounded ({} chars)",
        message.chars().count()
    );
    assert!(message.ends_with('…'), "expected clip marker: {message}");
}
