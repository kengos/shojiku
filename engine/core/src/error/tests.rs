//! Tests for the crate error type and its diagnostic mapping.

use super::*;
use shojiku_diagnostics::MAX_ECHO;

#[test]
fn located_maps_to_parse_error_with_location_args() {
    let err = CoreError::Located {
        what: "template",
        path: Echo::from("sections.body"),
        line: 3,
        column: 5,
        message: Echo::from("unknown field `foo`"),
    };
    let diag = err.to_diagnostic();
    assert_eq!(diag.code, "parse_error");
    assert_eq!(diag.path.as_deref(), Some("sections.body"));
    assert_eq!(diag.args.get("line"), Some(&3usize.into()));
    assert_eq!(diag.args.get("column"), Some(&5usize.into()));
    assert!(diag.message.contains("unknown field `foo`"));
}

#[test]
fn located_without_location_omits_line_and_column() {
    let err = CoreError::Located {
        what: "template",
        path: Echo::from("root"),
        line: 0,
        column: 0,
        message: Echo::from("bad"),
    };
    let diag = err.to_diagnostic();
    assert!(!diag.args.contains_key("line"));
    assert!(!diag.args.contains_key("column"));
}

#[test]
fn non_finite_maps_to_its_own_code() {
    let diag = CoreError::NonFinite("params").to_diagnostic();
    assert_eq!(diag.code, "non_finite_number");
    assert!(diag.message.contains("params"));
}

#[test]
fn structural_yaml_and_json_errors_degrade_to_parse_error() {
    let yaml = serde_yaml::from_str::<i32>("[unterminated").unwrap_err();
    let diag = CoreError::from(yaml).to_diagnostic();
    assert_eq!(diag.code, "parse_error");
    assert!(diag.args.contains_key("detail"));

    let json = serde_json::from_str::<i32>("{").unwrap_err();
    let diag = CoreError::from(json).to_diagnostic();
    assert_eq!(diag.code, "parse_error");
}

#[test]
fn a_hostile_yaml_document_cannot_blow_up_the_parse_message() {
    // The residual this cycle closes: a syntax/enum-variant failure on the
    // direct `Parse` path used to render the raw serde message, which quotes
    // the offending token verbatim.
    let hostile = format!("[{}", "k".repeat(10_000));
    let err = CoreError::from(serde_yaml::from_str::<i32>(&hostile).unwrap_err());
    let message = err.to_string();
    assert!(
        message.chars().count() <= MAX_ECHO + 64,
        "unbounded parse echo: {} chars",
        message.chars().count()
    );
}

#[test]
fn a_hostile_params_document_cannot_inject_control_characters() {
    // The `params` path goes through `Json`. A JSON string may carry escapes
    // that decode to real control characters, so the guard has to run on the
    // DECODED text, which is what the serde message quotes.
    let hostile = r#"{"k": "[31mred"} trailing"#;
    let err = CoreError::from(serde_json::from_str::<serde_json::Value>(hostile).unwrap_err());
    let message = err.to_string();
    assert!(
        !message.chars().any(char::is_control),
        "control character survived into a params error: {message:?}"
    );
}

#[test]
fn a_located_error_bounds_both_the_path_and_the_message() {
    let err = CoreError::Located {
        what: "template",
        path: Echo::from("a".repeat(10_000)),
        line: 1,
        column: 1,
        message: Echo::from(format!("unknown field `{}`", "\u{1b}[2J".repeat(500))),
    };
    let message = err.to_string();
    assert!(!message.chars().any(char::is_control));
    // Two echoed values plus the surrounding prose, each capped at MAX_ECHO.
    assert!(message.chars().count() <= 2 * (MAX_ECHO + 1) + 64);
}

#[test]
fn the_diagnostic_args_stay_bounded_when_the_echo_is_already_at_the_cap() {
    // The two guards compose rather than fight: the field type bounds the
    // value to MAX_ECHO + a marker, and `ArgValue::text` bounds the arg to
    // MAX_ECHO. So the arg is the marker-free head — which is the right wire
    // value, since a consumer re-renders args through its own catalog and has
    // no use for the engine's truncation marker.
    let err = CoreError::Located {
        what: "definitions",
        path: Echo::from("p".repeat(400)),
        line: 0,
        column: 0,
        message: Echo::from("m".repeat(400)),
    };
    let diag = err.to_diagnostic();
    assert_eq!(diag.args.get("detail"), Some(&"m".repeat(MAX_ECHO).into()));
    assert_eq!(diag.args.get("path"), Some(&"p".repeat(MAX_ECHO).into()));
}
