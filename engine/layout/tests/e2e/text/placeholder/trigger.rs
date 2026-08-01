//! Blank-form `placeholder`: a binding whose value is absent / `null` /
//! `""` draws the author-set placeholder verbatim and reports nothing,
//! across every text-bearing context. A present-but-invalid value still
//! reports `format_error` — the intentional-blank signal is not a mask.

use crate::common::*;

/// The single `data:`-bound text item, one param object. Placeholder is
/// authored on the binding.
fn one_binding(params: Value, extra: &str) -> (LayoutDocument, Diagnostics) {
    run(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 500, h: 500 }}
    items:
      - type: text
        box: {{ w: 200, h: 20 }}
        data: {{ key: birth_date, format: wareki, placeholder: "　年　月　日"{extra} }}
"#
        ),
        params,
    )
}

#[test]
fn absent_key_draws_placeholder_no_diagnostic() {
    let (doc, diags) = one_binding(json!({}), "");
    assert!(diags.is_empty(), "expected clean: {diags:?}");
    assert_eq!(all_text(&doc.pages[0]), "　年　月　日");
}

#[test]
fn null_value_draws_placeholder_no_diagnostic() {
    let (doc, diags) = one_binding(json!({ "birth_date": null }), "");
    assert!(diags.is_empty(), "expected clean: {diags:?}");
    assert_eq!(all_text(&doc.pages[0]), "　年　月　日");
}

#[test]
fn empty_string_draws_placeholder_no_diagnostic() {
    // The `""`-value spelling — what a blank JSON form actually carries.
    // Without the placeholder this is the `format_error` the probe found.
    let (doc, diags) = one_binding(json!({ "birth_date": "" }), "");
    assert!(diags.is_empty(), "expected clean: {diags:?}");
    assert_eq!(all_text(&doc.pages[0]), "　年　月　日");
}

#[test]
fn present_value_ignores_placeholder() {
    let (doc, diags) = one_binding(json!({ "birth_date": "1993-04-10" }), "");
    assert!(diags.is_empty(), "expected clean: {diags:?}");
    // The formatted wareki date, not the placeholder.
    assert!(
        all_text(&doc.pages[0]).contains('年') && !all_text(&doc.pages[0]).starts_with('　'),
        "got: {}",
        all_text(&doc.pages[0])
    );
}

#[test]
fn present_but_invalid_still_reports_format_error() {
    // A garbage date is a DATA BUG, not a blank field: the placeholder must
    // not mask it. `format: date` forces the date type (no definitions
    // needed), so the non-blank "not-a-date" reaches the formatter and
    // fails.
    let (_doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        box: { w: 200, h: 20 }
        data: { key: birth_date, format: date, placeholder: "　年　月　日" }
"#,
        json!({ "birth_date": "not-a-date" }),
    );
    assert!(
        diags.iter().any(|d| d.code == "format_error"),
        "invalid value must still warn under a placeholder: {diags:?}"
    );
}

#[test]
fn empty_placeholder_is_a_clean_blank() {
    // `placeholder: ""` = suppress the diagnostic AND draw nothing.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        box: { w: 200, h: 20 }
        data: { key: birth_date, format: wareki, placeholder: "" }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "expected clean: {diags:?}");
    assert_eq!(all_text(&doc.pages[0]), "");
}

#[test]
fn placeholder_is_verbatim_not_interpolated() {
    // A `{...}` inside the placeholder text stays literal — it is drawn,
    // never resolved as a binding.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        box: { w: 300, h: 20 }
        data: { key: birth_date, placeholder: "{birth_date}未" }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "expected clean: {diags:?}");
    assert_eq!(all_text(&doc.pages[0]), "{birth_date}未");
}
