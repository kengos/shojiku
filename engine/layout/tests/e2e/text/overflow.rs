//! Text overflow policies end to end (`src/engine/text/overflow.rs`):
//! `shrink` and `ellipsis` on definite-height boxes, their inertness on
//! auto-height boxes, and the `visible` default's unchanged behavior.

use crate::common::*;

/// A 4-line CJK text in a box that fits ~2 lines at 10pt (lineHeight 1.0
/// keeps the arithmetic exact: line height == font size).
fn overflowing_text(policy: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: text
        text: ああああああああああああ
        box: {{ x: 0, y: 0, w: 32, h: 20 }}
        style: {{ fontSize: 10, lineHeight: 1.0{policy} }}
"#
    )
}

#[test]
fn visible_default_still_warns_and_grows() {
    let (doc, diags) = run(&overflowing_text(""), json!({}));
    assert!(diags.iter().any(|d| d.code == "text_overflow"));
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.font_size, 10.0);
    assert!(
        block.lines.len() > 2,
        "all content drawn: {:?}",
        block.lines
    );
}

#[test]
fn shrink_reduces_font_size_until_content_fits() {
    let (doc, diags) = run(&overflowing_text(", textOverflow: shrink"), json!({}));
    assert!(
        !diags.iter().any(|d| d.code == "text_overflow"),
        "shrink resolves the overflow: {diags:?}"
    );
    let block = text_blocks(&doc.pages[0])[0];
    assert!(block.font_size < 10.0, "shrunk, got {}", block.font_size);
    // lineHeight scales with the size (multiplier 1.0) and the wrapped
    // block fits the 20pt box.
    assert_eq!(block.line_height, block.font_size);
    let content_h = block.lines.len() as f64 * block.line_height;
    assert!(content_h <= 20.0 + 0.01, "fits: {content_h}");
}

#[test]
fn shrink_at_the_floor_keeps_the_overflow_warning() {
    // 200 chars into a sliver: even 4pt cannot fit; floor + warning.
    let (doc, diags) = run(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: text
        text: {}
        box: {{ x: 0, y: 0, w: 10, h: 4 }}
        style: {{ fontSize: 10, lineHeight: 1.0, textOverflow: shrink }}
"#,
            "あ".repeat(200)
        ),
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "text_overflow"));
    assert_eq!(text_blocks(&doc.pages[0])[0].font_size, 4.0);
}

#[test]
fn shrink_is_inert_on_auto_height_boxes() {
    // No `h`: the block grows to fit (Thinreports `expand`), so there is
    // nothing to shrink and no warning.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 32, h: 500 }
    items:
      - type: text
        text: ああああああああああああ
        style: { fontSize: 10, lineHeight: 1.0, textOverflow: shrink }
"#,
        json!({}),
    );
    assert!(!diags.iter().any(|d| d.code == "text_overflow"));
    assert_eq!(text_blocks(&doc.pages[0])[0].font_size, 10.0);
}

#[test]
fn ellipsis_clamps_to_the_fitting_lines_and_appends_the_mark() {
    let (doc, diags) = run(&overflowing_text(", textOverflow: ellipsis"), json!({}));
    assert!(
        !diags.iter().any(|d| d.code == "text_overflow"),
        "clamping resolves the overflow: {diags:?}"
    );
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.font_size, 10.0, "ellipsis never rescales");
    assert_eq!(block.lines.len(), 2, "20pt / 10pt lines = 2");
    let last = &block.lines[1].text;
    assert!(last.ends_with('…'), "got: {last}");
    // The clamped line (with its mark) fits the 32pt content width.
    assert_eq!(block.lines[0].x, 0.0);
}

#[test]
fn ellipsis_single_line_behaves_like_css_text_overflow() {
    // Height for exactly one line: the classic one-line ellipsis.
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: ああああああああ
        box: { x: 0, y: 0, w: 42, h: 10 }
        style: { fontSize: 10, lineHeight: 1.0, textOverflow: ellipsis }
"#,
        json!({}),
    );
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.lines.len(), 1);
    assert!(block.lines[0].text.ends_with('…'));
}

#[test]
fn ellipsis_box_too_short_for_any_line_warns_and_draws_nothing() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: ああああ
        box: { x: 0, y: 0, w: 100, h: 4 }
        style: { fontSize: 10, lineHeight: 1.0, textOverflow: ellipsis }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "text_overflow"));
    assert!(text_blocks(&doc.pages[0])[0].lines.is_empty());
}

#[test]
fn named_style_carries_the_overflow_policy() {
    let (doc, _) = run(
        r#"
styles:
  clamp: { textOverflow: ellipsis }
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: ああああああああああああ
        box: { x: 0, y: 0, w: 32, h: 20 }
        style: { fontSize: 10, lineHeight: 1.0 }
        styleNames: [clamp]
"#,
        json!({}),
    );
    let block = text_blocks(&doc.pages[0])[0];
    assert!(block.lines.last().expect("lines").text.ends_with('…'));
}

#[test]
fn ellipsis_reserves_the_authored_height_not_the_grown_one() {
    // Flow stacking pins the observable reserve: with `visible` the
    // overflowing block pushes the next item down by the grown height;
    // with `ellipsis` the next item sits at the authored 20pt.
    let template = |policy: &str| {
        format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 32, h: 500 }}
    items:
      - type: text
        text: ああああああああああああ
        box: {{ h: 20 }}
        style: {{ fontSize: 10, lineHeight: 1.0{policy} }}
      - type: text
        text: next
        style: {{ fontSize: 10, lineHeight: 1.0 }}
"#
        )
    };
    let (doc, _) = run(&template(", textOverflow: ellipsis"), json!({}));
    let clamped_next_y = text_blocks(&doc.pages[0])[1].lines[0].y;
    assert_eq!(clamped_next_y, 20.0);
    let (doc, _) = run(&template(""), json!({}));
    let visible_next_y = text_blocks(&doc.pages[0])[1].lines[0].y;
    assert!(visible_next_y > 20.0, "visible grows: {visible_next_y}");
}
