//! Page orientation × custom size (`src/engine.rs` page assembly): a
//! custom `{ w, h }` states its dimensions literally, so an extra
//! `orientation: landscape` is ignored (no double-swap) and warns
//! `orientation_ignored`. Named sizes still swap silently.

use crate::common::*;

fn has_code(diags: &Diagnostics, code: &str) -> bool {
    diags.iter().any(|d| d.code == code)
}

#[test]
fn custom_size_plus_landscape_warns_and_does_not_swap() {
    let out = run_full(
        r#"
page:
  size: { w: 400, h: 200 }
  orientation: landscape
sections:
  body:
    type: absolute
    items:
      - { type: rect, style: { borderWidth: 1 }, box: { x: 0, y: 0, w: 10, h: 10 } }
"#,
        json!({}),
    );
    assert!(has_code(&out.diagnostics, "orientation_ignored"));
    // Dimensions stay as authored: 400 wide, not swapped to 200.
    assert_eq!(out.margin, [25.0, 25.0, 25.0, 25.0]);
    assert_eq!(out.document.page_width, 400.0);
    assert_eq!(out.document.page_height, 200.0);
}

#[test]
fn custom_size_without_orientation_does_not_warn() {
    let out = run_full(
        r#"
page:
  size: { w: 400, h: 200 }
sections:
  body: { type: absolute, items: [] }
"#,
        json!({}),
    );
    assert!(!has_code(&out.diagnostics, "orientation_ignored"));
}

#[test]
fn named_size_plus_landscape_swaps_without_warning() {
    let out = run_full(
        r#"
page:
  size: A4
  orientation: landscape
sections:
  body: { type: absolute, items: [] }
"#,
        json!({}),
    );
    assert!(!has_code(&out.diagnostics, "orientation_ignored"));
    assert_eq!(out.document.page_width, 841.89);
    assert_eq!(out.document.page_height, 595.28);
}
