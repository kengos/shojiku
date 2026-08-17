//! What a `visible:` binding does with params the predicate cannot use.
//!
//! Each of these warns and leaves the item unshown, matching the form mark
//! exactly — consistency with the surface being generalized is the point
//! of the feature, so the shapes are pinned rather than left to drift.

use crate::common::*;
use serde_json::json;

#[test]
fn a_type_mismatch_warns_and_does_not_show_the_item() {
    let out = run_full(&super::stack("", ""), json!({ "show": 2 }));
    let d = out
        .diagnostics
        .items
        .iter()
        .find(|d| d.code.as_str() == "visible_value_not_bool")
        .expect("a non-boolean without `equals` warns");
    assert!(d.message.contains("show"), "{}", d.message);
    assert_eq!(rect_shapes(&out.document.pages[0]).len(), 2);
}

#[test]
fn an_equals_of_the_wrong_kind_warns_and_does_not_show_the_item() {
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 50, h: 30 }
        visible: { key: code, equals: "2" }
"#;
    let out = run_full(yaml, json!({ "code": 2 }));
    let d = out
        .diagnostics
        .items
        .iter()
        .find(|d| d.code.as_str() == "visible_type_mismatch")
        .expect("`\"2\"` never equals `2`");
    assert!(d.message.contains("code"), "{}", d.message);
    assert!(rect_shapes(&out.document.pages[0]).is_empty());
}

#[test]
fn a_non_scalar_params_value_warns_instead_of_panicking() {
    let out = run_full(&super::stack("", ""), json!({ "show": { "a": 1 } }));
    assert!(out
        .diagnostics
        .items
        .iter()
        .any(|d| d.code.as_str() == "visible_value_not_bool"));
    assert_eq!(rect_shapes(&out.document.pages[0]).len(), 2);
}

#[test]
fn an_explicit_null_behaves_exactly_as_a_form_mark_does() {
    // Pinned rather than diverged from: `resolve_path` finds the key and
    // hands back `null`, which is not a boolean, so it warns. Consistency
    // with the surface being generalized is the point.
    let out = run_full(&super::stack("", ""), json!({ "show": null }));
    assert!(out
        .diagnostics
        .items
        .iter()
        .any(|d| d.code.as_str() == "visible_value_not_bool"));
}

#[test]
fn a_key_absent_from_params_hides_silently() {
    // A blank form draws nothing and says nothing — the form-mark posture.
    let out = run_full(&super::stack("", ""), json!({}));
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert_eq!(rect_shapes(&out.document.pages[0]).len(), 2);
}

#[test]
fn a_fault_is_reported_exactly_once_per_item() {
    // The verdict is computed ONCE per child list and consumed by both the
    // planning pre-pass and the walk. If any path re-evaluated it, this item
    // would warn twice — and the predicate's array path is O(params length),
    // so a second evaluation is a doubled cost as well as a doubled message.
    let out = run_full(&super::stack("", ""), json!({ "show": "yes" }));
    let n = out
        .diagnostics
        .items
        .iter()
        .filter(|d| d.code.as_str() == "visible_value_not_bool")
        .count();
    assert_eq!(n, 1, "diags: {:?}", out.diagnostics);
}

#[test]
fn a_fault_inside_a_flex_parent_is_also_reported_once() {
    // The flex/grid path is where a second evaluation would be easiest to
    // introduce: `kinds` filters by the verdict and so does the walk.
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 200, h: 100, direction: row }
        items:
          - type: container
            box: { h: 20 }
            visible: { key: show }
            items: []
"#;
    let out = run_full(yaml, json!({ "show": "yes" }));
    let n = out
        .diagnostics
        .items
        .iter()
        .filter(|d| d.code.as_str() == "visible_value_not_bool")
        .count();
    assert_eq!(n, 1, "diags: {:?}", out.diagnostics);
}

#[test]
fn a_long_multi_select_array_terminates_with_the_right_verdict() {
    // `n` is driven by PARAMS here, not by the template: the array-contains
    // path walks every element. Pinned so the cost stays linear and the
    // verdict stays correct at length.
    let mut many: Vec<String> = (0..5_000).map(|i| format!("code-{i}")).collect();
    many.push("sms".to_string());
    let out = run_full(&super::stack("", ", equals: sms"), json!({ "show": many }));
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert_eq!(
        rect_shapes(&out.document.pages[0]).len(),
        3,
        "the item shows"
    );
}

#[test]
fn a_hostile_key_is_sanitized_before_it_is_echoed() {
    // The key is document-authored and rides `ArgValue`, which strips control
    // AND bidirectional formatting characters (the Trojan Source family, which
    // `char::is_control` does not match) before clipping. A diagnostic that
    // quoted the key back raw would let a template reorder how the message
    // DISPLAYS to whoever reads it.
    let yaml = "page: { margin: 0 }\nsections:\n  body:\n    type: flow\n    items:\n      - type: rect\n        style: { borderWidth: 1 }\n        box: { w: 50, h: 30 }\n        visible: { key: \"pa\u{202e}id\" }\n";
    let out = run_full(yaml, json!({ "pa\u{202e}id": "yes" }));
    let d = out
        .diagnostics
        .items
        .iter()
        .find(|d| d.code.as_str() == "visible_value_not_bool")
        .expect("a non-boolean warns");
    assert!(
        !d.message.contains('\u{202e}'),
        "the bidi override must be stripped: {:?}",
        d.message
    );
    assert!(d.message.contains("paid"), "{}", d.message);
}
