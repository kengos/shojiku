//! A table cell's `verticalAlign` precedence end to end: a body cell takes
//! its column's, then a matching row condition's, then the zebra layer's,
//! then the body band's, then the table's; a header label its column's,
//! then the header row's, then the table's; a header group its own, then
//! the table's — each layer's named styles included, and `middle` only
//! when no layer authored one.

use crate::common::*;

/// Every row here is 40pt with the frame's 4pt padding, so a 14pt line
/// sits at `+4` (top), `+13` (middle, 4 + (32-14)/2) or `+22` (bottom)
/// below its row's top.
const TOP: f64 = 4.0;
const MIDDLE: f64 = 13.0;
const BOTTOM: f64 = 22.0;

fn valign_table(
    styles: &str,
    extra: &str,
    columns: &str,
    rows: Value,
) -> (LayoutDocument, Diagnostics) {
    run(
        &format!(
            r#"
page: {{ margin: 0 }}
styles:
  up: {{ verticalAlign: top }}
  down: {{ verticalAlign: bottom }}
{styles}sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 600 }}
    items:
      - type: table
        data: {{ key: items }}
{extra}        columns:
{columns}"#
        ),
        json!({ "items": rows }),
    )
}

/// Two label-less columns: `a` carries `column_a` inside its braces.
fn body_columns(column_a: &str) -> String {
    format!(
        "          - {{ data: {{ key: a }}, width: 100{column_a} }}\n          - {{ data: {{ key: b }}, width: 100 }}\n"
    )
}

fn y(doc: &LayoutDocument, text: &str) -> f64 {
    cell_pos(&doc.pages[0], text).1
}

#[test]
fn the_body_bands_vertical_align_reaches_every_body_cell_under_its_columns_own() {
    let (doc, diags) = valign_table(
        "",
        "        row: { height: 40, style: { verticalAlign: bottom } }\n",
        &body_columns(", style: { verticalAlign: top }"),
        json!([{ "a": "a0", "b": "b0" }]),
    );
    assert!(diags.is_empty(), "{diags:?}");
    // `b` authored nothing, so the band's value reaches it; `a`'s own wins.
    assert_eq!(y(&doc, "b0"), BOTTOM);
    assert_eq!(y(&doc, "a0"), TOP);
}

#[test]
fn a_matching_rule_beats_the_band_and_the_column_beats_the_rule() {
    let (doc, diags) = valign_table(
        "",
        concat!(
            "        row:\n",
            "          height: 40\n",
            "          style: { verticalAlign: bottom }\n",
            "          conditionalStyles:\n",
            "            - { when: { key: heading }, style: { verticalAlign: top } }\n",
        ),
        &body_columns(", style: { verticalAlign: middle }"),
        json!([
            { "a": "a0", "b": "b0", "heading": true },
            { "a": "a1", "b": "b1" },
        ]),
    );
    assert!(diags.is_empty(), "{diags:?}");
    // Row 0 matches: the rule's `top` wins over the band's `bottom`…
    assert_eq!(y(&doc, "b0"), TOP);
    // …row 1 does not, so the band's value stands there.
    assert_eq!(y(&doc, "b1"), 40.0 + BOTTOM);
    // The column's own `middle` wins over both, in either row.
    assert_eq!(y(&doc, "a0"), MIDDLE);
    assert_eq!(y(&doc, "a1"), 40.0 + MIDDLE);
}

#[test]
fn the_zebra_layer_reaches_alternate_rows_under_a_matching_rule() {
    let (doc, diags) = valign_table(
        "",
        concat!(
            "        row:\n",
            "          height: 40\n",
            "          alternateStyle: { verticalAlign: top }\n",
            "          conditionalStyles:\n",
            "            - { when: { key: late }, style: { verticalAlign: bottom } }\n",
        ),
        &body_columns(""),
        json!([
            { "a": "a0", "b": "b0" },
            { "a": "a1", "b": "b1" },
            { "a": "a2", "b": "b2" },
            { "a": "a3", "b": "b3", "late": true },
        ]),
    );
    assert!(diags.is_empty(), "{diags:?}");
    // Odd rows are the alternate ones; even rows keep the default.
    assert_eq!(y(&doc, "b0"), MIDDLE);
    assert_eq!(y(&doc, "b1"), 40.0 + TOP);
    assert_eq!(y(&doc, "b2"), 80.0 + MIDDLE);
    // An alternate row a rule matches takes the rule's value.
    assert_eq!(y(&doc, "b3"), 120.0 + BOTTOM);
}

#[test]
fn named_styles_on_the_table_the_band_the_zebra_and_a_rule_each_count() {
    let run_with = |extra: &str| {
        let (doc, diags) = valign_table(
            "",
            extra,
            &body_columns(""),
            json!([{ "a": "a0", "b": "b0", "heading": true }, { "a": "a1", "b": "b1" }]),
        );
        assert!(diags.is_empty(), "{diags:?}");
        doc
    };
    // The table's named style alone reaches every body cell.
    let doc = run_with("        styleNames: [down]\n        row: { height: 40 }\n");
    // Neither column authors one, so it reaches every cell of every row.
    for (text, top) in [("a0", 0.0), ("b0", 0.0), ("a1", 40.0), ("b1", 40.0)] {
        assert_eq!(y(&doc, text), top + BOTTOM, "{text}");
    }
    // The band's named style wins over the table's.
    let doc =
        run_with("        styleNames: [down]\n        row: { height: 40, styleNames: [up] }\n");
    assert_eq!(y(&doc, "b0"), TOP);
    assert_eq!(y(&doc, "b1"), 40.0 + TOP);
    // A matching rule's named style wins over the band's.
    let doc = run_with(concat!(
        "        styleNames: [down]\n",
        "        row:\n",
        "          height: 40\n",
        "          styleNames: [up]\n",
        "          conditionalStyles:\n",
        "            - { when: { key: heading }, styleNames: [down] }\n",
    ));
    assert_eq!(y(&doc, "b0"), BOTTOM);
    assert_eq!(y(&doc, "b1"), 40.0 + TOP);
    // The zebra layer's named styles count on the alternate row, over the band.
    let doc = run_with(concat!(
        "        row:\n",
        "          height: 40\n",
        "          styleNames: [down]\n",
        "          alternateStyleNames: [up]\n",
    ));
    assert_eq!(y(&doc, "b0"), BOTTOM);
    assert_eq!(y(&doc, "b1"), 40.0 + TOP);
}

#[test]
fn a_later_matching_rule_beats_an_earlier_one() {
    let (doc, diags) = valign_table(
        "",
        concat!(
            "        row:\n",
            "          height: 40\n",
            "          conditionalStyles:\n",
            "            - { when: { key: heading }, style: { verticalAlign: top } }\n",
            "            - { when: { key: late }, style: { verticalAlign: bottom } }\n",
            "            - { when: { key: heading }, style: { color: \"#333333\" } }\n",
        ),
        &body_columns(""),
        json!([
            { "a": "a0", "b": "b0", "heading": true, "late": true },
            { "a": "a1", "b": "b1", "heading": true },
        ]),
    );
    assert!(diags.is_empty(), "{diags:?}");
    // Both rules match row 0: the later one's `bottom` wins, and a still
    // later entry that authors no alignment leaves it standing.
    assert_eq!(y(&doc, "b0"), BOTTOM);
    // Only the first matches row 1.
    assert_eq!(y(&doc, "b1"), 40.0 + TOP);
}

/// A table with a header group over both labelled columns, the table's own
/// style set to `top`: the group row is at 0, the labels at 40, the body at
/// 80.
fn headed_table(header_style: &str, group_style: &str) -> (LayoutDocument, Diagnostics) {
    valign_table(
        "",
        &format!(
            concat!(
                "        style: {{ verticalAlign: top }}\n",
                "        headerGroups:\n",
                "          - {{ label: G, span: 2{group} }}\n",
                "        header: {{ height: 40{header} }}\n",
                "        row: {{ height: 40 }}\n",
            ),
            group = group_style,
            header = header_style,
        ),
        concat!(
            "          - { label: A, data: { key: a }, width: 100, style: { verticalAlign: bottom } }\n",
            "          - { label: B, data: { key: b }, width: 100 }\n",
        ),
        json!([{ "a": "a0", "b": "b0" }]),
    )
}

#[test]
fn the_tables_vertical_align_reaches_body_cells_labels_and_groups() {
    let (doc, diags) = headed_table("", "");
    assert!(diags.is_empty(), "{diags:?}");
    assert_eq!(y(&doc, "G"), TOP);
    assert_eq!(y(&doc, "B"), 40.0 + TOP);
    assert_eq!(y(&doc, "b0"), 80.0 + TOP);
    // Column `a` authored `bottom`, for its label and its body cells alike.
    assert_eq!(y(&doc, "A"), 40.0 + BOTTOM);
    assert_eq!(y(&doc, "a0"), 80.0 + BOTTOM);
}

#[test]
fn the_header_rows_vertical_align_beats_the_tables_for_labels_only() {
    let (doc, diags) = headed_table(", style: { verticalAlign: middle }", "");
    assert!(diags.is_empty(), "{diags:?}");
    assert_eq!(y(&doc, "B"), 40.0 + MIDDLE);
    // The header row's style is the LABEL row's: the group and the body
    // still take the table's.
    assert_eq!(y(&doc, "G"), TOP);
    assert_eq!(y(&doc, "b0"), 80.0 + TOP);
    // And a column's own still beats the header row's.
    assert_eq!(y(&doc, "A"), 40.0 + BOTTOM);
}

#[test]
fn a_groups_own_vertical_align_beats_the_tables() {
    let (doc, diags) = headed_table("", ", style: { verticalAlign: bottom }");
    assert!(diags.is_empty(), "{diags:?}");
    assert_eq!(y(&doc, "G"), BOTTOM);
    assert_eq!(y(&doc, "B"), 40.0 + TOP);
}
