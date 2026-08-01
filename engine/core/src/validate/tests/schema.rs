//! Params-vs-schema validation: required keys, type/range/enum checks,
//! unknown params keys, and the format-coherence warning. Edge cases
//! (mismatch wording, non-object roots, format coherence) live in the
//! child module.

mod coherence;

use super::*;

fn sdefs() -> Definitions {
    parse_definitions(
        r#"
type: object
required: [receipt]
properties:
  receipt:
    type: object
    required: [number]
    properties:
      number:
        type: string
        minLength: 1
        maxLength: 10
      status:
        type: string
        enum: [draft, sent]
  count:
    type: integer
    minimum: 1
    maximum: 99
  rate:
    type: number
    maximum: 1
  paid:
    type: boolean
  items:
    type: array
    minItems: 1
    maxItems: 3
    items:
      type: object
      properties:
        name:
          type: string
"#,
    )
    .expect("defs")
}

fn find<'d>(diags: &'d Diagnostics, code: &str) -> Vec<&'d shojiku_diagnostics::Diagnostic> {
    diags.iter().filter(|d| d.code == code).collect()
}

fn key_of(diag: &shojiku_diagnostics::Diagnostic) -> String {
    serde_json::to_value(&diag.args["key"])
        .expect("arg")
        .as_str()
        .expect("string arg")
        .to_string()
}

fn run(params: serde_json::Value) -> Diagnostics {
    let template = tpl("      - type: text\n        text: static\n");
    validate(Some(&sdefs()), &template, Some(&params))
}

#[test]
fn missing_required_warns_without_a_path() {
    let diags = run(json!({}));
    let hits = find(&diags, "params_missing_required");
    assert_eq!(hits.len(), 1, "{diags:?}");
    assert_eq!(key_of(hits[0]), "receipt");
    // Params diagnostics carry their location in `key`, NEVER in `path`
    // (whose grammar is template box paths).
    assert!(hits[0].path.is_none());
    assert_eq!(hits[0].severity, shojiku_diagnostics::Severity::Warning);
}

#[test]
fn nested_required_and_null_count_as_missing() {
    let diags = run(json!({ "receipt": { "number": null } }));
    let hits = find(&diags, "params_missing_required");
    assert_eq!(hits.len(), 1, "{diags:?}");
    assert_eq!(key_of(hits[0]), "receipt.number");
}

#[test]
fn blank_values_skip_every_check() {
    // Present + non-null satisfies `required`, and a BLANK value (`""` —
    // the engine-wide blank predicate; blank-form params variants fill even
    // number fields with it) skips type/range/length/enum checks entirely:
    // blanks are the placeholder domain, not schema findings.
    let diags = run(json!({ "receipt": { "number": "" }, "count": "" }));
    for code in [
        "params_missing_required",
        "params_length_out_of_range",
        "params_type_mismatch",
    ] {
        assert!(find(&diags, code).is_empty(), "{code}: {diags:?}");
    }
}

#[test]
fn a_non_blank_short_string_still_violates_max_length() {
    let diags = run(json!({ "receipt": { "number": "12345678901" } }));
    let hits = find(&diags, "params_length_out_of_range");
    assert_eq!(hits.len(), 1, "{diags:?}");
    assert_eq!(key_of(hits[0]), "receipt.number");
}

#[test]
fn type_mismatches_name_expected_and_actual() {
    let diags = run(json!({ "receipt": { "number": 42 } }));
    let hits = find(&diags, "params_type_mismatch");
    assert_eq!(hits.len(), 1, "{diags:?}");
    let message = &hits[0].message;
    assert!(message.contains("expects string"), "{message}");
    assert!(message.contains("got number"), "{message}");
}

#[test]
fn object_where_array_declared_is_a_mismatch() {
    let diags = run(json!({ "receipt": { "number": "R-1" }, "items": {} }));
    let hits = find(&diags, "params_type_mismatch");
    assert_eq!(hits.len(), 1, "{diags:?}");
    assert!(
        hits[0].message.contains("expects array"),
        "{}",
        hits[0].message
    );
}

#[test]
fn integer_rejects_a_fractional_number() {
    let diags = run(json!({ "receipt": { "number": "R-1" }, "count": 3.5 }));
    let hits = find(&diags, "params_type_mismatch");
    assert_eq!(hits.len(), 1, "{diags:?}");
    assert!(
        hits[0].message.contains("expects integer"),
        "{}",
        hits[0].message
    );
}

#[test]
fn range_violations_report_both_sides() {
    let low = run(json!({ "receipt": { "number": "R-1" }, "count": 0 }));
    let hits = find(&low, "params_out_of_range");
    assert_eq!(hits.len(), 1, "{low:?}");
    assert!(
        hits[0].message.contains("below minimum"),
        "{}",
        hits[0].message
    );

    let high = run(json!({ "receipt": { "number": "R-1" }, "rate": 1.5 }));
    let hits = find(&high, "params_out_of_range");
    assert_eq!(hits.len(), 1, "{high:?}");
    assert!(
        hits[0].message.contains("above maximum"),
        "{}",
        hits[0].message
    );
}

#[test]
fn string_length_counts_chars_not_bytes() {
    // Ten kanji are thirty UTF-8 bytes but exactly the ten-char cap.
    let diags = run(json!({ "receipt": { "number": "領収書番号領収書番号" } }));
    assert!(
        find(&diags, "params_length_out_of_range").is_empty(),
        "{diags:?}"
    );
}

#[test]
fn array_item_counts_use_the_items_kind() {
    let diags = run(json!({ "receipt": { "number": "R-1" }, "items": [] }));
    let hits = find(&diags, "params_length_out_of_range");
    assert_eq!(hits.len(), 1, "{diags:?}");
    assert!(hits[0].message.contains("items"), "{}", hits[0].message);
    assert!(
        hits[0].message.contains("below minimum"),
        "{}",
        hits[0].message
    );
}

#[test]
fn array_elements_are_checked_against_the_row_schema() {
    let diags = run(json!({
        "receipt": { "number": "R-1" },
        "items": [{ "name": "ok" }, { "name": 7 }]
    }));
    let hits = find(&diags, "params_type_mismatch");
    assert_eq!(hits.len(), 1, "{diags:?}");
    assert_eq!(key_of(hits[0]), "items[1].name");
}

#[test]
fn enum_mismatch_names_only_the_key() {
    let diags = run(json!({ "receipt": { "number": "R-1", "status": "paid" } }));
    let hits = find(&diags, "params_enum_mismatch");
    assert_eq!(hits.len(), 1, "{diags:?}");
    assert_eq!(key_of(hits[0]), "receipt.status");
    // The declared values are never echoed.
    assert!(!hits[0].message.contains("draft"), "{}", hits[0].message);
}

#[test]
fn unknown_keys_warn_and_are_not_descended() {
    let diags = run(json!({
        "receipt": { "number": "R-1", "memo": "x" },
        "extra": { "deep": { "deeper": [1, 2, 3] } }
    }));
    let mut keys: Vec<String> = find(&diags, "params_unknown_key")
        .iter()
        .map(|d| key_of(d))
        .collect();
    keys.sort();
    // `extra` is reported at its top and never entered; nothing inside it
    // (the hostile-depth guard) produces a diagnostic.
    assert_eq!(keys, vec!["extra", "receipt.memo"], "{diags:?}");
}

#[test]
fn matching_params_stay_silent() {
    let diags = run(json!({
        "receipt": { "number": "R-1", "status": "sent" },
        "count": 2,
        "rate": 0.1,
        "paid": true,
        "items": [{ "name": "a" }]
    }));
    for code in [
        "params_missing_required",
        "params_type_mismatch",
        "params_out_of_range",
        "params_length_out_of_range",
        "params_enum_mismatch",
        "params_unknown_key",
    ] {
        assert!(find(&diags, code).is_empty(), "{code}: {diags:?}");
    }
}

#[test]
fn no_params_or_no_definitions_stays_silent() {
    let template = tpl("      - type: text\n        text: static\n");
    let without_params = validate(Some(&sdefs()), &template, None);
    assert!(find(&without_params, "params_missing_required").is_empty());
    let without_defs = validate(None, &template, Some(&json!({ "anything": 1 })));
    assert!(find(&without_defs, "params_unknown_key").is_empty());
}
