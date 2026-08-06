//! List items end to end (`src/engine/list.rs`): entry templates, the
//! count-aware overflow clamp, per-entry ellipsis, cell scoping, and
//! the hostile-array cap. The vertical (縦書き) list lives in
//! [`vertical`].

mod nested;
mod vertical;
mod vertical_combine;

use crate::common::*;

/// The list's rendered lines — shared with the suites that assert a list
/// carries something (the `enum`-label carriers).
pub(super) fn lines_of(page: &LayoutPage) -> Vec<String> {
    text_blocks(page)
        .first()
        .map(|b| line_texts(b))
        .unwrap_or_default()
}

#[test]
fn entries_that_fit_render_one_line_each() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: list
        box: { x: 0, y: 0, w: 200, h: 40 }
        data: { key: lines }
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "lines": ["ひとつ", "ふたつ", "みっつ"] }),
    );
    assert!(diags.items.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(lines_of(&doc.pages[0]), vec!["ひとつ", "ふたつ", "みっつ"]);
}

#[test]
fn overflow_clamps_and_reports_the_cut_count() {
    // 40pt box at 10pt lines fits 4; 6 entries → 3 kept + 他3件.
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: list
        box: { x: 0, y: 0, w: 200, h: 40 }
        data: { key: lines }
        overflowText: "他{count}件"
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "lines": ["a", "b", "c", "d", "e", "f"] }),
    );
    assert_eq!(lines_of(&doc.pages[0]), vec!["a", "b", "c", "他3件"]);
}

#[test]
fn default_overflow_text_is_plus_count() {
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: list
        box: { x: 0, y: 0, w: 200, h: 20 }
        data: { key: lines }
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "lines": ["a", "b", "c"] }),
    );
    assert_eq!(lines_of(&doc.pages[0]), vec!["a", "+2"]);
}

#[test]
fn entry_template_interpolates_each_element() {
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: list
        box: { x: 0, y: 0, w: 200, h: 40 }
        data: { key: items }
        text: "{name} ×{quantity}"
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "items": [
            { "name": "りんご", "quantity": 3 },
            { "name": "みかん", "quantity": 5 }
        ] }),
    );
    assert_eq!(lines_of(&doc.pages[0]), vec!["りんご ×3", "みかん ×5"]);
}

#[test]
fn auto_height_lists_render_everything_and_grow() {
    // Flow stacking observes the grown reserve: 3 entries at 10pt push
    // the next item to y = 30.
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 500 }
    items:
      - type: list
        data: { key: lines }
        style: { fontSize: 10, lineHeight: 1.0 }
      - type: text
        text: next
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "lines": ["a", "b", "c"] }),
    );
    let blocks = text_blocks(&doc.pages[0]);
    assert_eq!(blocks[0].lines.len(), 3);
    assert_eq!(blocks[1].lines[0].y, 30.0);
}

#[test]
fn wide_entries_take_a_per_entry_ellipsis() {
    // A 40pt-wide box fits ~4 CJK chars at 10pt: the entry clamps with …
    // instead of wrapping to a second line.
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: list
        box: { x: 0, y: 0, w: 40, h: 20 }
        data: { key: lines }
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "lines": ["ああああああああ"] }),
    );
    let lines = lines_of(&doc.pages[0]);
    assert_eq!(lines.len(), 1);
    assert!(lines[0].ends_with('…'), "got: {lines:?}");
}

#[test]
fn repeat_cells_scope_the_list_to_each_element() {
    // The pickup ticket: each cell lists ITS element's items.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 100 }
    items:
      - type: repeat
        data: { key: tickets }
        grid: { columns: 2, rows: 1 }
        cell:
          items:
            - type: list
              box: { x: 0, y: 0, w: 90, h: 30 }
              data: { key: items }
              text: "{name}"
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "tickets": [
            { "items": [{ "name": "コーヒー" }] },
            { "items": [{ "name": "ケーキ" }, { "name": "クッキー" }] }
        ] }),
    );
    assert!(diags.items.is_empty(), "unexpected diagnostics: {diags:?}");
    let blocks = text_blocks(&doc.pages[0]);
    assert_eq!(line_texts(blocks[0]), vec!["コーヒー"]);
    assert_eq!(line_texts(blocks[1]), vec!["ケーキ", "クッキー"]);
}

#[test]
fn missing_or_non_array_data_degrades_with_diagnostics() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: list
        box: { x: 0, y: 0, w: 100, h: 20 }
        data: { key: ghost }
      - type: list
        box: { x: 0, y: 0, w: 100, h: 20 }
        data: { key: scalar }
"#,
        json!({ "scalar": 42 }),
    );
    assert!(diags.iter().any(|d| d.code == "missing_data"));
    assert!(diags.iter().any(|d| d.code == "not_an_array"));
    assert!(text_blocks(&doc.pages[0]).is_empty());
}

#[test]
fn hostile_arrays_are_capped_and_counted() {
    // 1,500 entries, auto height: the cap keeps 1,000 and the overflow
    // line reports the other 500 — bounded work, honest output.
    let entries: Vec<String> = (0..1500).map(|i| format!("e{i}")).collect();
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 800 }
    items:
      - type: list
        data: { key: lines }
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "lines": entries }),
    );
    let lines = lines_of(&doc.pages[0]);
    assert_eq!(lines.len(), 1001);
    assert_eq!(lines.last().map(String::as_str), Some("+500"));
}

#[test]
fn text_align_applies_per_line_and_scalars_format_directly() {
    // Right alignment shifts each line to the content-box right edge;
    // non-string scalar entries print without a template.
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: list
        box: { x: 0, y: 0, w: 100, h: 30 }
        data: { key: lines }
        style: { fontSize: 10, lineHeight: 1.0, textAlign: right }
      - type: list
        box: { x: 0, y: 40, w: 100, h: 30 }
        data: { key: lines }
        style: { fontSize: 10, lineHeight: 1.0, textAlign: center }
"#,
        json!({ "lines": [42, 7] }),
    );
    let blocks = text_blocks(&doc.pages[0]);
    assert_eq!(line_texts(blocks[0]), vec!["42", "7"]);
    // Right-aligned: line right edges sit at x + line width == 100.
    for line in &blocks[0].lines {
        assert!(line.x > 50.0, "right-aligned: {line:?}");
    }
    // Center-aligned lines sit between left and right variants.
    for line in &blocks[1].lines {
        assert!(
            line.x > 0.0 && line.x < blocks[0].lines[0].x,
            "centered: {line:?}"
        );
    }
}
