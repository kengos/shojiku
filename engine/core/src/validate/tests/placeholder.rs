//! `placeholder` suppression of `missing_data` in validation: an
//! author-set placeholder (on the binding or the field) is the
//! "intentionally blank" signal, so a missing key covered by one is not
//! reported. Without a placeholder, behavior is unchanged.

use super::*;

/// Definitions where `order.code` carries a field-level placeholder and
/// `order.total` does not — the two sides of the suppression rule.
fn defs_ph() -> Definitions {
    parse_definitions(
        r#"
type: object
properties:
  order:
    type: object
    properties:
      code:
        type: string
        placeholder: "（未記入）"
      total:
        type: number
        format: currency
"#,
    )
    .expect("defs")
}

#[test]
fn binding_placeholder_suppresses_missing_data() {
    let template = tpl(r#"
      - type: text
        data: { key: order.total, placeholder: "—" }
"#);
    // No definitions: only the placement placeholder can cover it.
    let diags = validate(None, &template, Some(&json!({})));
    assert!(
        !diags.iter().any(|d| d.code == "missing_data"),
        "placeholder should suppress missing_data: {diags:?}"
    );
}

#[test]
fn field_placeholder_suppresses_missing_data() {
    let template = tpl(r#"
      - type: text
        data: { key: order.code }
"#);
    let diags = validate(Some(&defs_ph()), &template, Some(&json!({})));
    assert!(
        !diags.iter().any(|d| d.code == "missing_data"),
        "field placeholder should suppress missing_data: {diags:?}"
    );
}

#[test]
fn field_placeholder_covers_interpolation_segment() {
    // An inline `{key}` segment carries no placeholder of its own; the
    // field's covers it — the blank-form 履歴書 inline case.
    let template = tpl(r#"
      - type: text
        text: "コード: {order.code}"
"#);
    let diags = validate(Some(&defs_ph()), &template, Some(&json!({})));
    assert!(
        !diags.iter().any(|d| d.code == "missing_data"),
        "field placeholder should cover the segment: {diags:?}"
    );
}

#[test]
fn no_placeholder_still_reports_missing_data() {
    // The field WITHOUT a placeholder (order.total) keeps warning.
    let template = tpl(r#"
      - type: text
        data: { key: order.total }
"#);
    let diags = validate(Some(&defs_ph()), &template, Some(&json!({})));
    assert!(
        diags.iter().any(|d| d.code == "missing_data"),
        "an uncovered binding must still warn: {diags:?}"
    );
}

#[test]
fn placeholder_does_not_mask_unknown_key() {
    // A placeholder is about ABSENT data, not an undeclared key — the
    // typo-safety check is orthogonal and still fires.
    let template = tpl(r#"
      - type: text
        data: { key: order.ghost, placeholder: "—" }
"#);
    let diags = validate(Some(&defs_ph()), &template, Some(&json!({})));
    assert!(
        diags.iter().any(|d| d.code == "unknown_data_key"),
        "unknown key must still error under a placeholder: {diags:?}"
    );
}
