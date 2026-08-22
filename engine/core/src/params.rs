//! `params` — runtime data supplied by the calling application.

use crate::error::CoreError;
use serde_json::Value;

/// Parses params from JSON or YAML into a JSON value tree. Non-finite
/// numbers are rejected: `serde_json` would silently turn them into
/// `null`, hiding data problems from validation.
pub fn parse_params(input: &str) -> Result<Value, CoreError> {
    crate::yaml_guard::ensure_bounded_size(input, "params")?;
    // serde_yaml handles JSON as well (YAML is a superset).
    let value: serde_yaml::Value = serde_yaml::from_str(input)?;
    crate::yaml_guard::ensure_finite(&value, "params")?;
    Ok(serde_json::to_value(value)?)
}

/// Resolves a dotted binding path like `order.code` against a params tree.
///
/// Only object traversal is supported; array elements are addressed by the
/// table machinery, not by paths.
pub fn resolve_path<'a>(params: &'a Value, key: &str) -> Option<&'a Value> {
    let mut current = params;
    for part in key.split('.') {
        current = current.as_object()?.get(part)?;
    }
    Some(current)
}

/// Whether a resolved binding value counts as "intentionally blank" — the
/// trigger for a `placeholder`. The three blank spellings a form author
/// reaches for: the key is absent, it is `null`, or it is `""`.
///
/// Deliberately narrow: whitespace (`" "`, `"　"`) is real authored content
/// a form may want drawn, `0` and `false` are real values, and an empty
/// array/object belongs to the table/repeat machinery, not here. Anything
/// present but unusable (a `"abc"` date) stays a `format_error` — a data
/// bug must not hide behind a blank-form placeholder.
pub fn is_blank(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => true,
        Some(Value::String(s)) => s.is_empty(),
        Some(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_json_params() {
        let params = parse_params(r#"{"order": {"code": "ORDER1"}}"#).expect("parse");
        assert_eq!(params["order"]["code"], json!("ORDER1"));
    }

    #[test]
    fn parses_yaml_params() {
        let params = parse_params("order:\n  code: ORDER1\n").expect("parse");
        assert_eq!(params["order"]["code"], json!("ORDER1"));
    }

    #[test]
    fn rejects_non_finite_numbers() {
        let err = parse_params("amount:\n  total: .inf\n").expect_err("must reject");
        assert!(err.to_string().contains("non-finite"), "got: {err}");
    }

    #[test]
    fn resolves_nested_path() {
        let params = json!({"a": {"b": {"c": 42}}});
        assert_eq!(resolve_path(&params, "a.b.c"), Some(&json!(42)));
    }

    #[test]
    fn missing_path_is_none() {
        let params = json!({"a": {"b": 1}});
        assert_eq!(resolve_path(&params, "a.x"), None);
        assert_eq!(resolve_path(&params, "a.b.c"), None);
    }

    #[test]
    fn resolves_array_value_as_whole() {
        let params = json!({"items": [1, 2, 3]});
        assert_eq!(resolve_path(&params, "items"), Some(&json!([1, 2, 3])));
    }

    #[test]
    fn absent_null_and_empty_string_are_blank() {
        assert!(is_blank(None));
        assert!(is_blank(Some(&json!(null))));
        assert!(is_blank(Some(&json!(""))));
    }

    #[test]
    fn whitespace_zero_and_false_are_not_blank() {
        // Authored whitespace is content a form may want drawn; `0`/`false`
        // are real values a placeholder must never mask.
        assert!(!is_blank(Some(&json!(" "))));
        assert!(!is_blank(Some(&json!("　"))));
        assert!(!is_blank(Some(&json!(0))));
        assert!(!is_blank(Some(&json!(false))));
    }

    #[test]
    fn empty_containers_are_not_blank() {
        // Arrays/objects belong to the table/repeat machinery, which reports
        // its own `not_an_array`/empty-behavior — not to the placeholder.
        assert!(!is_blank(Some(&json!([]))));
        assert!(!is_blank(Some(&json!({}))));
    }
}

#[cfg(test)]
mod size_tests {
    use super::*;
    use crate::{CoreError, MAX_INPUT_BYTES};

    #[test]
    fn oversize_params_are_refused_before_the_parse() {
        // `parse_params` does NOT go through `parse_checked`, so it is the
        // door most likely to be missed by a cap added at the choke point.
        // Broken syntax + oversize: `TooLarge` proves the order.
        let oversize = format!("{{unterminated\n{}", "#".repeat(MAX_INPUT_BYTES));
        let err = parse_params(&oversize).expect_err("must refuse");
        assert!(
            matches!(err, CoreError::TooLarge { what: "params", .. }),
            "got: {err:?}"
        );
    }

    #[test]
    fn params_at_the_cap_are_still_parsed() {
        let doc = "order: { code: A1 }\n";
        let params = format!("{doc}{}", "#".repeat(MAX_INPUT_BYTES - doc.len()));
        assert_eq!(params.len(), MAX_INPUT_BYTES);
        let value = parse_params(&params).expect("the admitted maximum must parse");
        assert_eq!(
            resolve_path(&value, "order.code").and_then(|v| v.as_str()),
            Some("A1")
        );
    }
}
