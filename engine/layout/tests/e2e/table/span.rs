//! Table spanning end to end: the `headerGroups` group row and the
//! `mergeEmptyCells` body transform (mirrors src `engine/table/span.rs`).

use crate::common::*;

fn span_table(extra: &str, rows: Value) -> (LayoutDocument, Diagnostics) {
    run(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 300, h: 600 }}
    items:
      - type: table
        data: {{ key: rows }}
{extra}        columns:
          - {{ label: 年, data: {{ key: y }}, width: 100 }}
          - {{ label: 月, data: {{ key: m }}, width: 80 }}
          - {{ label: 事項, data: {{ key: d }}, width: 120 }}
"#
        ),
        json!({ "rows": rows }),
    )
}

#[test]
fn header_groups_render_a_spanning_row_above_the_labels() {
    let (doc, diags) = span_table(
        "        headerGroups:\n          - { label: 期間, span: 2 }\n          - { label: 内容, span: 1 }\n",
        json!([{ "y": "2026", "m": "7", "d": "x" }]),
    );
    assert!(diags.is_empty(), "{diags:?}");
    let blocks = text_blocks(&doc.pages[0]);
    let period = blocks
        .iter()
        .find(|b| b.lines[0].text == "期間")
        .expect("group");
    let year = blocks
        .iter()
        .find(|b| b.lines[0].text == "年")
        .expect("label");
    // The group row sits above the label row.
    assert!(period.lines[0].y < year.lines[0].y);
    // 内容 group starts where column 3 starts (100 + 80 = 180 + padding).
    let naiyo = blocks
        .iter()
        .find(|b| b.lines[0].text == "内容")
        .expect("group2");
    assert!(naiyo.lines[0].x >= 180.0, "x = {}", naiyo.lines[0].x);
}

#[test]
fn header_groups_repeat_on_every_page_with_the_header() {
    let rows: Vec<Value> = (1..=40)
        .map(|i| json!({ "y": i.to_string(), "m": "1", "d": "x" }))
        .collect();
    let (doc, _) = span_table(
        "        headerGroups:\n          - { label: 期間, span: 2 }\n        row: { height: 40 }\n",
        json!(rows),
    );
    assert!(doc.pages.len() > 1);
    for page in &doc.pages {
        assert!(
            text_blocks(page).iter().any(|b| b.lines[0].text == "期間"),
            "group row must repeat"
        );
    }
}

#[test]
fn over_spanning_groups_clamp_with_a_diagnostic() {
    let (_, diags) = span_table(
        "        headerGroups:\n          - { label: a, span: 5 }\n          - { label: b, span: 1 }\n",
        json!([{ "y": "1", "m": "2", "d": "3" }]),
    );
    let clamped: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "header_group_span_clamped")
        .collect();
    assert!(!clamped.is_empty(), "{diags:?}");
    // The warning names the table it came from, like every other
    // layout-stage diagnostic.
    assert_eq!(
        clamped[0].path.as_deref(),
        Some("sections.body.items[0]"),
        "{diags:?}"
    );
}

/// A fill as its authored `#rrggbb` bytes: comparing float literals is a
/// trap (`#ededed` is 237/255), so expectations read as the hex the
/// template wrote — the idiom the header-fill check in `style.rs` uses.
fn fill_bytes(fill: (f32, f32, f32)) -> [f32; 3] {
    [
        (fill.0 * 255.0).round(),
        (fill.1 * 255.0).round(),
        (fill.2 * 255.0).round(),
    ]
}

/// The classic header band fill (`#ededed`) both header rows default to.
const BAND: [f32; 3] = [237.0, 237.0, 237.0];

/// Every filled rect on the page, as `#rrggbb` bytes.
fn fills(page: &LayoutPage) -> Vec<[f32; 3]> {
    rect_shapes(page)
        .into_iter()
        .filter_map(|r| r.fill.map(fill_bytes))
        .collect()
}

#[test]
fn a_group_background_color_paints_across_its_spanned_columns() {
    let (doc, diags) = span_table(
        "        headerGroups:\n          - { label: 期間, span: 2, style: { backgroundColor: \"#3366cc\" } }\n          - { label: 内容, span: 1 }\n",
        json!([{ "y": "2026", "m": "7", "d": "x" }]),
    );
    assert!(diags.is_empty(), "{diags:?}");
    let painted: Vec<_> = rect_shapes(&doc.pages[0])
        .into_iter()
        .filter(|r| r.fill.map(fill_bytes) == Some([51.0, 102.0, 204.0]))
        .collect();
    assert_eq!(
        painted.len(),
        1,
        "one fill for the one group that authored it"
    );
    // It covers the two columns the group spans (100 + 80), from the
    // table's left edge — `cellPadding` insets the text, not the fill.
    assert_eq!(painted[0].x, 0.0);
    assert_eq!(painted[0].w, 180.0);
}

#[test]
fn a_group_border_paints_and_an_unstyled_group_adds_no_rect() {
    let (doc, diags) = span_table(
        "        headerGroups:\n          - { label: 期間, span: 2, style: { borderWidth: 2, borderColor: \"#3366cc\" } }\n          - { label: 内容, span: 1 }\n",
        json!([{ "y": "2026", "m": "7", "d": "x" }]),
    );
    assert!(diags.is_empty(), "{diags:?}");
    let stroked: Vec<_> = rect_shapes(&doc.pages[0])
        .into_iter()
        .filter(|r| r.stroke == Some((0.2, 0.4, 0.8)) && r.stroke_width == 2.0)
        .collect();
    assert_eq!(stroked.len(), 1, "the authoring group only");
    assert_eq!(stroked[0].w, 180.0);
}

#[test]
fn groups_authoring_no_fill_leave_the_band_fill_alone() {
    let (doc, diags) = span_table(
        "        headerGroups:\n          - { label: 期間, span: 2 }\n          - { label: 内容, span: 1 }\n",
        json!([{ "y": "2026", "m": "7", "d": "x" }]),
    );
    assert!(diags.is_empty(), "{diags:?}");
    // Exactly the two header bands (group row + label row) are filled,
    // both with the classic default: an unstyled group adds nothing.
    assert_eq!(fills(&doc.pages[0]), vec![BAND, BAND]);
}

#[test]
fn a_hostile_group_fill_warns_and_paints_nothing() {
    let (doc, diags) = span_table(
        "        headerGroups:\n          - { label: 期間, span: 2, style: { backgroundColor: not-a-color } }\n          - { label: 内容, span: 1 }\n",
        json!([{ "y": "2026", "m": "7", "d": "x" }]),
    );
    let invalid: Vec<_> = diags.iter().filter(|d| d.code == "invalid_color").collect();
    assert_eq!(invalid.len(), 1, "{diags:?}");
    // The value was authored on the group, so the warning names the group —
    // the same address its box carries, so the GUI's jump-to-item lands on
    // the cell the user must fix.
    assert_eq!(
        invalid[0].path.as_deref(),
        Some("sections.body.items[0].headerGroups[0]")
    );
    // The garbage value paints nothing: only the two header bands remain.
    assert_eq!(fills(&doc.pages[0]), vec![BAND, BAND]);
}

#[test]
fn merge_empty_cells_widens_the_heading_cell() {
    let (doc, diags) = span_table(
        "        mergeEmptyCells: true\n",
        json!([
            { "y": "", "m": "", "d": "学歴" },
            { "y": "2016", "m": "4", "d": "入学" }
        ]),
    );
    assert!(diags.is_empty(), "{diags:?}");
    // The heading row draws NO column separators (one merged cell);
    // the data row draws 2. Separators are vertical lines.
    let seps = line_shapes(&doc.pages[0]);
    assert_eq!(seps.len(), 2 + 2, "header row + data row separators");
    // The 学歴 text starts at the row's left edge (plus cell padding),
    // not at column 3.
    let heading = text_blocks(&doc.pages[0])
        .into_iter()
        .find(|b| b.lines[0].text == "学歴")
        .expect("heading");
    assert!(heading.lines[0].x < 100.0, "x = {}", heading.lines[0].x);
}

#[test]
fn all_empty_row_collapses_to_one_full_width_cell() {
    let (doc, _) = span_table(
        "        mergeEmptyCells: true\n",
        json!([{ "y": "", "m": "", "d": "" }]),
    );
    // Header row separators only; the body row has a single cell.
    assert_eq!(line_shapes(&doc.pages[0]).len(), 2);
}

#[test]
fn a_group_honors_its_own_vertical_align() {
    // The group row is 40pt with 4pt padding (the frame's default), so a
    // 14pt line centers at 4 + (32-14)/2 = 13 and tops out at 4.
    let (doc, diags) = span_table(
        "        headerGroups:\n          - { label: 期間, span: 2 }\n        header: { height: 40 }\n",
        json!([{ "y": "2026", "m": "7", "d": "x" }]),
    );
    assert!(diags.is_empty(), "{diags:?}");
    assert_eq!(cell_pos(&doc.pages[0], "期間").1, 13.0);

    let (doc, diags) = span_table(
        "        headerGroups:\n          - { label: 期間, span: 2, style: { verticalAlign: top } }\n        header: { height: 40 }\n",
        json!([{ "y": "2026", "m": "7", "d": "x" }]),
    );
    assert!(diags.is_empty(), "{diags:?}");
    assert_eq!(cell_pos(&doc.pages[0], "期間").1, 4.0);
}

#[test]
fn a_list_level_span_problem_names_the_table_while_group_content_names_the_group() {
    // The two addresses a group row can report at, in one template. The
    // clamp is about the `headerGroups` LIST against the column count —
    // raised before any cell exists — so it stays on the table; a value
    // authored INSIDE a group names that group.
    let (_, diags) = span_table(
        "        headerGroups:\n          - { label: a, span: 9, style: { color: not-a-color } }\n",
        json!([{ "y": "1", "m": "2", "d": "3" }]),
    );
    let clamped: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "header_group_span_clamped")
        .collect();
    assert!(!clamped.is_empty(), "{diags:?}");
    assert_eq!(clamped[0].path.as_deref(), Some("sections.body.items[0]"));
    let invalid: Vec<_> = diags.iter().filter(|d| d.code == "invalid_color").collect();
    assert_eq!(invalid.len(), 1, "{diags:?}");
    assert_eq!(
        invalid[0].path.as_deref(),
        Some("sections.body.items[0].headerGroups[0]")
    );
}
