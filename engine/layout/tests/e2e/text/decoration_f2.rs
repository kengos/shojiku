//! `textDecoration` + `opacity` end to end: decoration geometry from
//! real font metrics, scaling under `shrink`, survival across pagination,
//! per-item opacity on text/rect/line and box decoration, non-inheritance,
//! and the `invalid_opacity` guard.

use crate::common::*;

fn one_text(style: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: text
        text: 領収書
        box: {{ x: 0, y: 0, w: 200 }}
        style: {{ fontSize: 20, lineHeight: 1.0{style} }}
"#
    )
}

#[test]
fn underline_sits_below_the_baseline_at_line_width() {
    let (doc, diags) = run(&one_text(", textDecoration: underline"), json!({}));
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    let d = block.decoration.expect("underline resolved");
    // The baseline sits `ascent` below the line top; the underline is
    // below it (post-table offset is negative y-up, so offset > ascent).
    let ascent = ja_store().face(None).ascent(20.0);
    assert!(
        d.offset > ascent,
        "underline top {:.2} should be below baseline {:.2}",
        d.offset,
        ascent
    );
    assert!(d.thickness > 0.0 && d.thickness <= 10.0);
    // The renderers size the line from the measured width.
    assert!(block.lines[0].width > 0.0);
    assert_eq!(block.opacity, 1.0);
}

#[test]
fn line_through_crosses_above_the_baseline() {
    let (doc, _) = run(&one_text(", textDecoration: line_through"), json!({}));
    let block = text_blocks(&doc.pages[0])[0];
    let d = block.decoration.expect("strikeout resolved");
    let ascent = ja_store().face(None).ascent(20.0);
    assert!(
        d.offset < ascent,
        "strikeout top {:.2} should be above baseline {:.2}",
        d.offset,
        ascent
    );
    // `none` (and unset) resolve to no decoration.
    let (doc, _) = run(&one_text(", textDecoration: none"), json!({}));
    assert!(text_blocks(&doc.pages[0])[0].decoration.is_none());
    let (doc, _) = run(&one_text(""), json!({}));
    assert!(text_blocks(&doc.pages[0])[0].decoration.is_none());
}

#[test]
fn decoration_scales_with_shrink() {
    // A definite-height box forces `shrink`; decoration must be computed
    // at the FINAL size, not the authored one.
    let template = r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: ああああああああああああ
        box: { x: 0, y: 0, w: 32, h: 20 }
        style: { fontSize: 10, lineHeight: 1.0, textOverflow: shrink,
                 textDecoration: underline }
"#;
    let (doc, _) = run(template, json!({}));
    let block = text_blocks(&doc.pages[0])[0];
    assert!(block.font_size < 10.0, "shrunk: {}", block.font_size);
    let d = block.decoration.expect("decoration survives shrink");
    // At most ascent(size) + size below the top — i.e. proportional to
    // the shrunk size, not the authored 10pt.
    let ascent = ja_store().face(None).ascent(block.font_size);
    assert!(d.offset > ascent && d.offset < ascent + block.font_size);
}

#[test]
fn decoration_survives_flow_pagination() {
    // An auto-height flow text taller than the page splits table-style;
    // every fragment keeps the decoration and per-line widths.
    let long_text = "あ".repeat(600);
    let template = format!(
        r#"
page: {{ size: A4, margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 100, h: 800 }}
    items:
      - type: text
        text: "{long_text}"
        box: {{ w: 100 }}
        style: {{ fontSize: 20, lineHeight: 1.5, textDecoration: underline }}
"#
    );
    let (doc, diags) = run(&template, json!({}));
    assert!(!diags.has_errors(), "{diags:?}");
    assert!(doc.pages.len() > 1, "should paginate");
    for page in &doc.pages {
        for block in text_blocks(page) {
            assert!(block.decoration.is_some(), "fragment lost decoration");
            assert!(block.lines.iter().all(|l| l.width > 0.0));
        }
    }
}

#[test]
fn list_entries_take_decoration_and_opacity() {
    let template = r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: list
        data: { key: items }
        text: "{name}"
        box: { x: 0, y: 0, w: 200 }
        style: { textDecoration: underline, opacity: 0.5 }
"#;
    let (doc, _) = run(template, json!({ "items": [{ "name": "みかん" }] }));
    let block = text_blocks(&doc.pages[0])[0];
    assert!(block.decoration.is_some());
    assert_eq!(block.opacity, 0.5);
    assert!(block.lines[0].width > 0.0);
}

#[test]
fn decoration_and_opacity_do_not_inherit_from_containers() {
    let template = r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 200, h: 100 }
        style: { textDecoration: underline, opacity: 0.5 }
        items:
          - type: text
            text: 子
            box: { w: 200 }
"#;
    let (doc, _) = run(template, json!({}));
    let block = text_blocks(&doc.pages[0])[0];
    // Non-inherited (CSS): the child text is undecorated and opaque.
    assert!(block.decoration.is_none());
    assert_eq!(block.opacity, 1.0);
}

#[test]
fn opacity_reaches_text_box_decoration_rect_and_line() {
    let template = r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: 薄い
        box: { x: 0, y: 0, w: 100 }
        style: { opacity: 0.25, backgroundColor: '#ff0000' }
      - type: rect
        box: { x: 0, y: 50, w: 40, h: 20 }
        style: { backgroundColor: '#00ff00', opacity: 0.5 }
      - type: line
        from: { x: 0, y: 90 }
        to: { x: 100, y: 90 }
        style: { opacity: 0.75 }
"#;
    let (doc, diags) = run(template, json!({}));
    assert!(!diags.has_errors(), "{diags:?}");
    let page = &doc.pages[0];
    let block = text_blocks(page)[0];
    assert_eq!(block.opacity, 0.25);
    // The text's backgroundColor rect carries the same item opacity; the
    // rect item and line item carry their own.
    let rects: Vec<&RectShape> = page
        .items
        .iter()
        .filter_map(|i| match i {
            LayoutItem::Rect(r) => Some(r),
            _ => None,
        })
        .collect();
    assert!(rects.iter().any(|r| r.opacity == 0.25 && r.fill.is_some()));
    assert!(rects.iter().any(|r| r.opacity == 0.5));
    let line = page
        .items
        .iter()
        .find_map(|i| match i {
            LayoutItem::Line(l) => Some(l),
            _ => None,
        })
        .expect("line item");
    assert_eq!(line.opacity, 0.75);
}

#[test]
fn out_of_range_opacity_warns_and_draws_opaque() {
    let (doc, diags) = run(&one_text(", opacity: 5"), json!({}));
    assert!(
        diags.iter().any(|d| d.code == "invalid_opacity"),
        "{diags:?}"
    );
    assert_eq!(text_blocks(&doc.pages[0])[0].opacity, 1.0);
    let (_, diags) = run(&one_text(", opacity: -0.5"), json!({}));
    assert!(diags.iter().any(|d| d.code == "invalid_opacity"));
}

#[test]
fn opacity_reaches_the_image_shape() {
    let assets = test_assets();
    let (doc, diags) = run_with_assets(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: image
        box: { w: 20, h: 20 }
        src: logo.png
        style: { opacity: 0.4 }
"#,
        json!({}),
        Some(&assets),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert_eq!(image_shapes(&doc.pages[0])[0].opacity, 0.4);
}

#[test]
fn table_cells_take_decoration_from_the_column_style() {
    let template = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 500 }
    items:
      - type: table
        data: { key: rows }
        columns:
          - { id: c1, label: 名前, data: { key: name },
              style: { textDecoration: underline } }
"#;
    let (doc, diags) = run(template, json!({ "rows": [{ "name": "各" }] }));
    assert!(!diags.has_errors(), "{diags:?}");
    let decorated = text_blocks(&doc.pages[0])
        .iter()
        .filter(|b| b.decoration.is_some())
        .count();
    // The body cell is decorated via the column style (the header is not).
    assert_eq!(decorated, 1);
}
