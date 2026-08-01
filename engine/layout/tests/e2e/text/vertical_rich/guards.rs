//! Hostile / boundary guards for vertical rich `spans` (the security
//! cases the coverage bar mandates): degenerate style values must degrade
//! to diagnostics, never panic or hang, and the column-overflow warning
//! must not fire at the exact-fit boundary.

use crate::common::*;

/// A one-span vertical block with the given box, font size, and style tail.
fn tmpl(text: &str, box_kv: &str, size: &str, style_extra: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 400 }}
    items:
      - type: text
        box: {{ {box_kv} }}
        style: {{ fontFamily: biz-ud-gothic, fontSize: {size}, lineHeight: 1.0, writingMode: vertical_rl{style_extra} }}
        spans:
          - text: "{text}"
"#
    )
}

#[test]
fn a_hostile_huge_font_size_degrades_without_panicking() {
    // `sane_font_size` has no upper cap: 1e300 passes clean, the column
    // width goes astronomically wide, and the overflow check must warn
    // (∞-safe f64 math), never panic.
    let (doc, diags) = run(&tmpl("あいう", "w: 200, h: 100", "1e300", ""), json!({}));
    assert_eq!(doc.pages.len(), 1);
    assert!(diags.iter().any(|d| d.code == "horizontal_overflow"));
}

#[test]
fn a_negative_letter_spacing_never_panics() {
    // −1000pt (the admitted magnitude cap) dwarfs every 10pt advance, so
    // extents go negative; the block must still build — alignment slack
    // is clamped ≥ 0 and nothing panics.
    let (doc, diags) = run(
        &tmpl(
            "あいうえお",
            "w: 200, h: 100",
            "10",
            ", letterSpacing: -1000",
        ),
        json!({}),
    );
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.lines.len(), 1, "everything collapses into one column");
    assert!(block.lines[0].y >= 0.0, "alignment slack stays clamped");
}

#[test]
fn columns_exactly_filling_the_box_do_not_warn() {
    // Twelve 10pt cells in a 100pt-tall box → two 10pt columns; a 20pt
    // box width holds them EXACTLY. The boundary must not warn
    // `horizontal_overflow` (the +1 side is pinned in the parent module).
    let (_doc, diags) = run(
        &tmpl("あいうえおかきくけこさし", "w: 20, h: 100", "10", ""),
        json!({}),
    );
    assert!(
        diags.iter().all(|d| d.code != "horizontal_overflow"),
        "spurious overflow at the exact-fit boundary"
    );
}
