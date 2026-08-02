//! Cell and row building end to end (mirrors src `engine/table/rows.rs`):
//! measure/render consistency, header overrides, fixed-height cell
//! overflow policies, alignment, and cell decoration.

use crate::common::*;

#[test]
fn cell_letter_spacing_affects_row_wrapping() {
    // The same cell content with and without letterSpacing: spacing
    // widens the measured run past the column width, so the spaced row
    // wraps to more lines and grows taller.
    let template = |style: &str| {
        format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 500, h: 500 }}
    items:
      - type: table
        data: {{ key: items }}
        columns:
          - label: v
            data: {{ key: v }}
            width: 60
            style: {{ fontSize: 10{style} }}
"#
        )
    };
    // Four full-width chars: 40pt fits the 60pt column unspaced; +8pt
    // per char (18pt each) forces a wrap.
    let params = json!({ "items": [ { "v": "ああああ" } ] });
    let (plain, _) = run(&template(""), params.clone());
    let (spaced, diags) = run(&template(", letterSpacing: 8"), params);
    assert!(!diags.has_errors());
    let plain_lines: usize = text_blocks(&plain.pages[0])
        .iter()
        .map(|t| t.lines.len())
        .sum();
    let spaced_lines: usize = text_blocks(&spaced.pages[0])
        .iter()
        .map(|t| t.lines.len())
        .sum();
    assert!(
        spaced_lines > plain_lines,
        "expected spacing to wrap the cell: {spaced_lines} !> {plain_lines}"
    );
}

#[test]
fn table_header_spec_controls_height_and_style() {
    let (doc, _diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: table
        data: { key: items }
        header:
          height: 40
          style: { fontSize: 8 }
        columns:
          - label: 名前
            data: { key: name }
            width: 200
"#,
        json!({ "items": [{"name": "x"}] }),
    );
    let texts = text_blocks(&doc.pages[0]);
    // Header label uses the custom style's font size.
    assert_eq!(texts[0].font_size, 8.0);
    // Header fill rect (the band decoration) is 40pt tall.
    let rects = rect_shapes(&doc.pages[0]);
    assert!(rects
        .iter()
        .any(|r| r.fill.is_some() && (r.h - 40.0).abs() < 0.01));
}

#[test]
fn table_row_missing_column_key_warns() {
    let (_doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: table
        data: { key: items }
        columns:
          - data: { key: absent }
            width: 100
"#,
        json!({ "items": [{"present": 1}] }),
    );
    assert!(diags.iter().any(|d| d.code == "missing_data"));
}

/// A one-column table with a fixed 30pt row and the given column style;
/// the 8-char CJK content wraps to two 14pt lines in the 60pt column,
/// overflowing the 22pt content box.
fn overflowing_fixed_row(column_style: &str) -> (LayoutDocument, Diagnostics) {
    run(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 600 }}
    items:
      - type: table
        data: {{ key: items }}
        row: {{ height: 30 }}
        columns:
          - data: {{ key: v }}
            width: 60
            style: {{ fontSize: 10{column_style} }}
"#
        ),
        json!({ "items": [ { "v": "ああああああああ" } ] }),
    )
}

#[test]
fn fixed_row_height_with_ellipsis_clamps_the_cell() {
    let (doc, diags) = overflowing_fixed_row(", textOverflow: ellipsis");
    assert!(!diags.iter().any(|d| d.code == "text_overflow"));
    let block = &text_blocks(&doc.pages[0])[0];
    assert_eq!(block.lines.len(), 1);
    assert!(block.lines[0].text.ends_with('…'), "got {:?}", block.lines);
    // The row stays exactly 30pt.
    assert_eq!(rect_shapes(&doc.pages[0])[0].h, 30.0);
}

#[test]
fn fixed_row_height_with_shrink_reduces_the_font() {
    let (doc, diags) = overflowing_fixed_row(", textOverflow: shrink");
    assert!(!diags.iter().any(|d| d.code == "text_overflow"));
    assert!(text_blocks(&doc.pages[0])[0].font_size < 10.0);
}

#[test]
fn fixed_row_height_with_visible_overflow_warns() {
    let (doc, diags) = overflowing_fixed_row("");
    assert!(diags.iter().any(|d| d.code == "text_overflow"));
    // The row box itself stays fixed; the text draws over.
    assert_eq!(rect_shapes(&doc.pages[0])[0].h, 30.0);
}

#[test]
fn cell_vertical_align_defaults_to_middle_and_honors_authored_top() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: table
        data: { key: items }
        row: { height: 40 }
        columns:
          - data: { key: a }
            width: 100
            style: { verticalAlign: top }
          - data: { key: b }
            width: 100
"#,
        json!({ "items": [ { "a": "x", "b": "y" } ] }),
    );
    assert!(diags.is_empty(), "diags: {:?}", diags);
    // Content box: 40 - 2x4 padding = 32pt for one 14pt line. Top pins
    // the line at the padding; the default centers it: 4 + (32-14)/2.
    assert_eq!(cell_pos(&doc.pages[0], "x").1, 4.0);
    assert_eq!(cell_pos(&doc.pages[0], "y").1, 13.0);
}

#[test]
fn column_background_covers_the_full_cell() {
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: table
        data: { key: items }
        columns:
          - data: { key: a }
            width: 100
          - data: { key: b }
            width: 100
            style: { backgroundColor: "#00ff00" }
"##,
        json!({ "items": [ { "a": "x", "b": "y" } ] }),
    );
    assert!(diags.is_empty(), "diags: {:?}", diags);
    // The fill spans the whole 100pt cell (not inset by the padding).
    let fill = rect_shapes(&doc.pages[0])
        .into_iter()
        .find(|r| r.fill == Some((0.0, 1.0, 0.0)))
        .expect("cell fill");
    assert_eq!((fill.x, fill.w, fill.h), (100.0, 100.0, 24.0));
}

/// The header row's own `verticalAlign`, and a column overriding it for
/// its label — the same precedence `textAlign` already follows there.
fn header_valign_table(header_style: &str, column_style: &str) -> (LayoutDocument, Diagnostics) {
    run(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 600 }}
    items:
      - type: table
        data: {{ key: items }}
        header: {{ height: 40{header_style} }}
        row: {{ height: 40 }}
        columns:
          - {{ label: ラベル, data: {{ key: a }}, width: 100{column_style} }}
          - {{ label: 既定, data: {{ key: b }}, width: 100 }}
"#
        ),
        json!({ "items": [ { "a": "x", "b": "y" } ] }),
    )
}

#[test]
fn header_labels_center_by_default_and_honor_the_headers_vertical_align() {
    // Same geometry as the body-cell test above: 40 - 2x4 padding = 32pt
    // for one 14pt line, so top pins at the padding and the default
    // centers at 4 + (32-14)/2.
    let (doc, diags) = header_valign_table("", "");
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert_eq!(cell_pos(&doc.pages[0], "ラベル").1, 13.0);
    assert_eq!(cell_pos(&doc.pages[0], "既定").1, 13.0);

    let (doc, diags) = header_valign_table(", style: { verticalAlign: top }", "");
    assert!(diags.is_empty(), "diags: {diags:?}");
    // Both labels take the header's value — it is the row's, not one cell's.
    assert_eq!(cell_pos(&doc.pages[0], "ラベル").1, 4.0);
    assert_eq!(cell_pos(&doc.pages[0], "既定").1, 4.0);
}

#[test]
fn a_columns_vertical_align_overrides_the_headers_for_its_own_label() {
    let (doc, diags) = header_valign_table(
        ", style: { verticalAlign: middle }",
        ", style: { verticalAlign: top }",
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    // The column authored `top`, so its label wins over the header's
    // `middle`; the column that authored nothing keeps the header's.
    assert_eq!(cell_pos(&doc.pages[0], "ラベル").1, 4.0);
    assert_eq!(cell_pos(&doc.pages[0], "既定").1, 13.0);
}
