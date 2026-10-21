//! Validation of shape styles: inert keys on rect/ellipse/checkbox/mark
//! inline styles, and `styleNames` references on the converged shapes.

use super::*;

#[test]
fn inert_keys_on_shape_inline_styles_warn_by_item_and_name() {
    let template = tpl(r#"
      - type: rect
        box: { x: 0, y: 0, w: 10, h: 10 }
        style: { fontSize: 12, backgroundColor: '#eeeeee' }
      - type: ellipse
        box: { x: 0, y: 20, w: 20, h: 10 }
        style: { textAlign: center }
      - type: checkbox
        box: { x: 0, y: 40, w: 8, h: 8 }
        style: { color: '#ff0000' }
      - type: text
        text: 現金
        mark: { style: { lineHeight: 2 } }
"#);
    let diags = validate(None, &template, None);
    let inert: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "shape_style_ignored")
        .collect();
    assert_eq!(inert.len(), 4, "got: {inert:?}");
    // One warning per item kind, naming the offending keys.
    assert!(inert[0].message.contains("rect") && inert[0].message.contains("fontSize"));
    assert!(inert[1].message.contains("ellipse") && inert[1].message.contains("textAlign"));
    assert!(inert[2].message.contains("checkbox") && inert[2].message.contains("color"));
    assert!(inert[3].message.contains("mark") && inert[3].message.contains("lineHeight"));
    assert!(
        inert[3]
            .path
            .as_deref()
            .is_some_and(|p| p.ends_with(".mark"))
    );
}

/// An ellipse, a checkbox and a mark stroke their outline as one path, so a
/// border pattern on them is reported; a rect draws it. A radius on the
/// marks is left to layout's `border_radius_ignored`.
#[test]
fn a_border_pattern_on_a_form_mark_warns_and_on_a_rect_does_not() {
    let template = tpl(r#"
      - type: rect
        box: { x: 0, y: 0, w: 10, h: 10 }
        style: { borderStyle: dashed, borderRadius: 2 }
      - type: ellipse
        box: { x: 0, y: 20, w: 20, h: 10 }
        style: { borderStyle: dashed, borderRadius: 2 }
      - type: checkbox
        box: { x: 0, y: 40, w: 8, h: 8 }
        style: { borderStyle: dotted }
      - type: text
        text: 現金
        mark: { style: { borderStyle: double } }
"#);
    let diags = validate(None, &template, None);
    let inert: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "shape_style_ignored")
        .collect();
    assert_eq!(inert.len(), 3, "got: {inert:?}");
    for (warning, item) in inert.iter().zip(["ellipse", "checkbox", "mark"]) {
        assert!(warning.message.contains(item), "{warning:?}");
        assert!(warning.message.contains("borderStyle"), "{warning:?}");
        assert!(!warning.message.contains("borderRadius"), "{warning:?}");
    }
}

#[test]
fn named_styles_on_shapes_are_not_flagged_for_inert_keys() {
    // A named style is a shared bag: its text keys may serve other users.
    let template = parse_template(
        r#"
styles:
  panel: { fontSize: 12, backgroundColor: '#eeeeee' }
sections:
  body:
    type: flow
    items:
      - type: rect
        box: { x: 0, y: 0, w: 10, h: 10 }
        styleNames: [panel]
"#,
    )
    .expect("template");
    let diags = validate(None, &template, None);
    assert!(
        !diags.iter().any(|d| d.code == "shape_style_ignored"),
        "named styles must not be flagged: {diags:?}"
    );
}

#[test]
fn shape_style_names_are_checked_against_the_registry() {
    let template = parse_template(
        r#"
styles:
  panel: { backgroundColor: '#eeeeee' }
sections:
  body:
    type: flow
    items:
      - type: rect
        box: { x: 0, y: 0, w: 10, h: 10 }
        styleNames: [ghost]
      - type: ellipse
        box: { x: 0, y: 20, w: 20, h: 10 }
        styleNames: [panel, ghost]
      - type: checkbox
        box: { x: 0, y: 40, w: 8, h: 8 }
        styleNames: [ghost]
      - type: text
        text: 現金
        mark: { styleNames: [ghost] }
"#,
    )
    .expect("template");
    let diags = validate(None, &template, None);
    let undefined: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "undefined_style_name")
        .collect();
    assert_eq!(undefined.len(), 4, "got: {undefined:?}");
    assert!(
        undefined[3]
            .path
            .as_deref()
            .is_some_and(|p| p.ends_with(".mark"))
    );
}
