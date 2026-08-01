//! Which rows a conditional entry selects, and how its layers stack with
//! the base, the zebra, and each other.

use super::*;

/// Rows: a tagged one, then an untagged one.
fn tagged_rows() -> Value {
    json!([
        { "label": "AAA", "kind": "heading" },
        { "label": "BBB" },
    ])
}

#[test]
fn an_equals_match_styles_only_the_matching_row() {
    let (doc, diags) = conditional_table(
        "          conditionalStyles:\n            - when: { key: kind, equals: heading }\n              style: { textAlign: center }\n",
        tagged_rows(),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert_centered(&doc.pages[0], "AAA");
    assert_left_aligned(&doc.pages[0], "BBB");
}

#[test]
fn a_conditional_layer_wins_over_the_zebra_layer() {
    // The 2nd row is the zebra row AND the one the predicate matches, so
    // the data-driven layer must be the one that shows.
    let (doc, diags) = conditional_table(
        "          alternateStyle: { backgroundColor: \"#ff0000\" }\n          conditionalStyles:\n            - when: { key: kind, equals: heading }\n              style: { backgroundColor: \"#00ff00\" }\n",
        json!([
            { "label": "AAA" },
            { "label": "BBB", "kind": "heading" },
        ]),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert_eq!(row_fills(&doc.pages[0]), vec![(0.0, 1.0, 0.0)]);
}

#[test]
fn later_entries_win_over_earlier_ones_per_property() {
    // Both entries match; the second one's color wins while the first
    // one's alignment survives (they set different properties).
    let (doc, diags) = conditional_table(
        "          conditionalStyles:\n            - when: { key: kind, equals: heading }\n              style: { textAlign: center, backgroundColor: \"#ff0000\" }\n            - when: { key: tone, equals: warn }\n              style: { backgroundColor: \"#0000ff\" }\n",
        json!([{ "label": "AAA", "kind": "heading", "tone": "warn" }]),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert_centered(&doc.pages[0], "AAA");
    assert_eq!(row_fills(&doc.pages[0]), vec![(0.0, 0.0, 1.0)]);
}

#[test]
fn an_entrys_inline_style_wins_over_its_style_names() {
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
styles:
  banner: { backgroundColor: "#ff0000", textAlign: center }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: table
        data: { key: items }
        cellPadding: 0
        row:
          conditionalStyles:
            - when: { key: kind, equals: heading }
              styleNames: [banner]
              style: { backgroundColor: "#0000ff" }
        columns:
          - data: { key: label }
            width: 200
"##,
        json!({ "items": [{ "label": "AAA", "kind": "heading" }] }),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    // The named layer's alignment applies, its fill is overridden inline.
    assert_centered(&doc.pages[0], "AAA");
    assert_eq!(row_fills(&doc.pages[0]), vec![(0.0, 0.0, 1.0)]);
}

#[test]
fn an_array_value_matches_by_contains() {
    let (doc, diags) = conditional_table(
        "          conditionalStyles:\n            - when: { key: tags, equals: urgent }\n              style: { textAlign: center }\n",
        json!([
            { "label": "AAA", "tags": ["new", "urgent"] },
            { "label": "BBB", "tags": ["new"] },
        ]),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert_centered(&doc.pages[0], "AAA");
    assert_left_aligned(&doc.pages[0], "BBB");
}

#[test]
fn an_equals_less_entry_reads_the_field_as_a_boolean() {
    let (doc, diags) = conditional_table(
        "          conditionalStyles:\n            - when: { key: flagged }\n              style: { textAlign: center }\n",
        json!([
            { "label": "AAA", "flagged": true },
            { "label": "BBB", "flagged": false },
        ]),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert_centered(&doc.pages[0], "AAA");
    assert_left_aligned(&doc.pages[0], "BBB");
}

#[test]
fn a_non_inherited_key_decorates_the_band_and_an_inherited_one_reaches_the_cell() {
    let (doc, diags) = conditional_table(
        "          conditionalStyles:\n            - when: { key: kind, equals: heading }\n              style: { backgroundColor: \"#00ff00\", color: \"#ff0000\" }\n",
        tagged_rows(),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    // Non-inherited: exactly one row band is filled.
    assert_eq!(row_fills(&doc.pages[0]), vec![(0.0, 1.0, 0.0)]);
    // Inherited: the matched row's cell text takes the color, the other
    // row's stays black.
    let colored = text_blocks(&doc.pages[0])
        .into_iter()
        .find(|b| b.lines[0].text == "AAA")
        .expect("matched cell");
    let plain = text_blocks(&doc.pages[0])
        .into_iter()
        .find(|b| b.lines[0].text == "BBB")
        .expect("unmatched cell");
    assert_eq!(colored.color, (1.0, 0.0, 0.0));
    assert_eq!(plain.color, (0.0, 0.0, 0.0));
}

#[test]
fn merged_empty_cells_take_the_conditional_alignment_across_the_full_width() {
    // `mergeEmptyCells` makes the section row one wide cell; the
    // conditional centering then applies across the merged width.
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
        cellPadding: 0
        mergeEmptyCells: true
        row:
          conditionalStyles:
            - when: { key: kind, equals: heading }
              style: { textAlign: center }
        columns:
          - data: { key: year }
            width: 100
          - data: { key: label }
            width: 200
"##,
        json!({ "items": [{ "year": "", "label": "AAA", "kind": "heading" }] }),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    // The merged cell spans both columns (300pt), so its center is 150.
    let (x, w) = line_geom(&doc.pages[0], "AAA");
    assert!(
        (x + w / 2.0 - 150.0).abs() < 0.5,
        "merged cell should center across 300pt; x={x} w={w}"
    );
}
