//! Validation for `image` items inside `repeat`/`repeat_flow` cells: a
//! `data:` binding is element-scoped (its key must be a field of the bound
//! array group) and src/data exclusivity is checked like any other image.

use super::*;

#[test]
fn cell_image_data_key_unknown_in_group_is_error() {
    let template = tpl(r#"
      - type: repeat
        data: { key: order_items }
        cell:
          items:
            - type: image
              box: { w: 20, h: 20 }
              data: { key: ghost }
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags
        .iter()
        .any(|d| d.code == "unknown_data_key" && d.message.contains("ghost")));
}

#[test]
fn cell_image_data_key_declared_in_group_passes() {
    // `name` is a declared (string) field: an image may reference it — an
    // image reference can legitimately be typed as a string (a URL), so no
    // type-mismatch is raised.
    let template = tpl(r#"
      - type: repeat
        data: { key: order_items }
        cell:
          items:
            - type: image
              box: { w: 20, h: 20 }
              data: { key: name }
"#);
    let params = json!({ "order_items": [{ "name": "logo.png" }] });
    let diags = validate(Some(&defs()), &template, Some(&params));
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
}

#[test]
fn cell_image_src_and_data_conflict_is_reported() {
    // collect_images recurses into cells, so the structural exclusivity
    // check (src XOR data) covers a repeat_flow card image too.
    let template = tpl(r#"
      - type: repeat_flow
        data: { key: order_items }
        item:
          items:
            - type: image
              box: { w: 20, h: 20 }
              src: logo.png
              data: { key: name }
"#);
    let diags = validate(Some(&defs()), &template, None);
    assert!(diags.iter().any(|d| d.code == "image_source_conflict"));
}
