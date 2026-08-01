//! `headerGroups` cells in the box index: a group cell is addressed by its
//! own authored position (`headerGroups[n]`), never as the leftmost column
//! it spans, and the cells layout synthesizes around it (the trailing
//! region no group covers, the all-empty `mergeEmptyCells` collapse) are
//! authored nowhere and so contribute no placement at all.

use super::page_boxes;
use crate::common::*;
use shojiku_layout::PlacedBox;
/// The paths of every placement on `page`, in emission order.
fn paths(out: &LayoutOutput, page: usize) -> Vec<&str> {
    page_boxes(out, page)
        .iter()
        .map(|b| b.path.as_str())
        .collect()
}

/// Every placement on page 0 whose path names a header group.
fn group_boxes(out: &LayoutOutput) -> Vec<&PlacedBox> {
    page_boxes(out, 0)
        .iter()
        .filter(|b| b.path.contains(".headerGroups["))
        .collect()
}

/// A six-column table (50pt each) with `groups` YAML spliced at the table
/// level, in a `region_h`-tall flow region — the fixture the header-group
/// placements are read from.
fn group_table(groups: &str, region_h: f64, rows: Value) -> LayoutOutput {
    let columns: String = ["a", "b", "c", "d", "e", "f"]
        .iter()
        .map(|k| format!("          - {{ label: {k}, data: {{ key: {k} }}, width: 50 }}\n"))
        .collect();
    run_full(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 300, h: {region_h} }}
    items:
      - type: table
        data: {{ key: rows }}
{groups}        columns:
{columns}"#
        ),
        json!({ "rows": rows }),
    )
}

/// One row filling every column of [`group_table`].
fn one_row() -> Value {
    json!([{ "a": "1", "b": "2", "c": "3", "d": "4", "e": "5", "f": "6" }])
}

#[test]
fn a_header_group_cell_is_addressed_as_its_group_not_as_a_column() {
    let out = group_table(
        "        headerGroups:\n          - { label: g0, span: 2 }\n          - { label: g1, span: 3 }\n          - { label: g2, span: 1 }\n",
        600.0,
        one_row(),
    );
    let groups = group_boxes(&out);
    // One placement per authored group, addressed by its OWN index — never
    // by the leftmost column it spans, which would make the GUI open that
    // column's editor and share its path with the column's own cells.
    assert_eq!(
        groups.iter().map(|b| b.path.as_str()).collect::<Vec<_>>(),
        vec![
            "sections.body.items[0].headerGroups[0]",
            "sections.body.items[0].headerGroups[1]",
            "sections.body.items[0].headerGroups[2]",
        ]
    );
    // Each covers the sum of its columns' widths, laid out left to right.
    assert_eq!(
        groups
            .iter()
            .map(|b| (b.border.x, b.border.w))
            .collect::<Vec<_>>(),
        vec![(0.0, 100.0), (100.0, 150.0), (250.0, 50.0)]
    );
    // A group authors no `id:`, and its content box is inset by the 4pt
    // cell padding like any other cell's.
    assert!(groups.iter().all(|b| b.id.is_none()));
    assert_eq!((groups[0].content.x, groups[0].content.w), (4.0, 92.0));
    // The label and body cells keep their own column addresses, so a column
    // click and a group click are now different selections.
    let columns: Vec<_> = paths(&out, 0)
        .into_iter()
        .filter(|p| p.contains(".columns["))
        .collect();
    assert_eq!(columns.len(), 12, "6 label cells + 6 body cells");
}

#[test]
fn header_group_placements_repeat_on_every_page_with_the_header() {
    let rows: Vec<Value> = (1..=6)
        .map(|i| json!({ "a": i, "b": 2, "c": 3, "d": 4, "e": 5, "f": 6 }))
        .collect();
    let out = group_table(
        "        headerGroups:\n          - { label: g0, span: 6 }\n",
        100.0,
        json!(rows),
    );
    assert!(out.document.pages.len() > 1, "expected pagination");
    for page in 0..out.document.pages.len() {
        assert!(
            paths(&out, page).contains(&"sections.body.items[0].headerGroups[0]"),
            "page {page} must carry the repeated group placement"
        );
    }
}

#[test]
fn the_trailing_region_no_group_covers_emits_no_placement() {
    let out = group_table(
        "        headerGroups:\n          - { label: g0, span: 2 }\n",
        600.0,
        one_row(),
    );
    // Columns c..f are uncovered, so layout draws one filler cell to keep
    // the band and grid complete — but nothing was authored there, so it
    // has no address to claim and contributes no placement.
    assert_eq!(
        group_boxes(&out)
            .iter()
            .map(|b| b.path.as_str())
            .collect::<Vec<_>>(),
        vec!["sections.body.items[0].headerGroups[0]"]
    );
    // The filler is drawn all the same: the group row's band still paints
    // across the full table width.
    assert!(rect_shapes(&out.document.pages[0])
        .iter()
        .any(|r| r.w == 300.0 && r.fill.is_some()));
    // Everything on the page: the table fragment, the one group, and the
    // 6 label + 6 body cells. The filler is the only cell drawn without one.
    assert_eq!(paths(&out, 0).len(), 1 + 1 + 12);
}

#[test]
fn an_all_empty_collapsed_row_emits_no_cell_placement() {
    let out = group_table(
        "        mergeEmptyCells: true\n",
        600.0,
        json!([
            { "a": "", "b": "", "c": "", "d": "", "e": "", "f": "" },
            { "a": "1", "b": "2", "c": "3", "d": "4", "e": "5", "f": "6" }
        ]),
    );
    // The collapsed row is one synthesized full-width cell covering every
    // column, so no column may claim it: 6 label cells + the second row's 6.
    let cells: Vec<_> = paths(&out, 0)
        .into_iter()
        .filter(|p| p.contains(".columns["))
        .collect();
    assert_eq!(cells.len(), 12);
    // The table itself stays addressable, so a click on the collapsed row
    // falls through to the table rather than selecting an arbitrary column.
    assert!(paths(&out, 0).contains(&"sections.body.items[0]"));
}

#[test]
fn clamped_and_dropped_groups_keep_their_authored_indices() {
    // `span: 0` clamps up to one column; the second group overruns the six
    // columns and is clamped to the five that are left; the third finds no
    // columns at all and is dropped entirely.
    let out = group_table(
        "        headerGroups:\n          - { label: g0, span: 0 }\n          - { label: g1, span: 9 }\n          - { label: g2, span: 1 }\n",
        600.0,
        one_row(),
    );
    let groups = group_boxes(&out);
    assert_eq!(
        groups.iter().map(|b| b.path.as_str()).collect::<Vec<_>>(),
        vec![
            "sections.body.items[0].headerGroups[0]",
            "sections.body.items[0].headerGroups[1]",
        ],
        "the dropped third group contributes no placement"
    );
    // g0 took the one column its clamp gave it, g1 the remaining five.
    assert_eq!(
        groups
            .iter()
            .map(|b| (b.border.x, b.border.w))
            .collect::<Vec<_>>(),
        vec![(0.0, 50.0), (50.0, 250.0)]
    );
    assert!(out
        .diagnostics
        .iter()
        .any(|d| d.code == "header_group_span_clamped"));
}

#[test]
fn a_span_at_the_integer_maximum_clamps_instead_of_wrapping() {
    // `span` parses as any u64. After a first group advances the cursor,
    // a wrapping `col + span` would land BEFORE the cursor and panic the
    // width slice — the sum must saturate, degrading to the same clamp
    // (with its diagnostic) any oversized span gets.
    let out = group_table(
        &format!(
            "        headerGroups:\n          - {{ label: g0, span: 1 }}\n          - {{ label: g1, span: {} }}\n",
            usize::MAX
        ),
        600.0,
        one_row(),
    );
    let groups = group_boxes(&out);
    assert_eq!(
        groups
            .iter()
            .map(|b| (b.path.as_str(), b.border.x, b.border.w))
            .collect::<Vec<_>>(),
        vec![
            ("sections.body.items[0].headerGroups[0]", 0.0, 50.0),
            ("sections.body.items[0].headerGroups[1]", 50.0, 250.0),
        ],
        "the hostile span clamps to the remaining columns"
    );
    assert!(out
        .diagnostics
        .iter()
        .any(|d| d.code == "header_group_span_clamped"));
}
