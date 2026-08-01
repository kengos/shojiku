//! Table styling end to end (mirrors src `engine/table/style.rs`): the
//! authorable grid border, row fills and zebra striping, the table
//! cascade into cells, and the header fill default/override.

use crate::common::*;

pub(crate) fn styled_table(table_extra: &str, rows: usize) -> (LayoutDocument, Diagnostics) {
    let items: Vec<Value> = (1..=rows).map(|i| json!({"n": i})).collect();
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
{table_extra}        columns:
          - data: {{ key: n }}
            width: 100
"#
        ),
        json!({ "items": items }),
    )
}

#[test]
fn grid_border_width_and_color_are_authorable() {
    let (doc, diags) = styled_table(
        "        style: { borderWidth: 2, borderColor: \"#ff0000\" }\n",
        1,
    );
    assert!(diags.is_empty(), "diags: {:?}", diags);
    let outline = rect_shapes(&doc.pages[0])[0];
    assert_eq!(outline.stroke_width, 2.0);
    assert_eq!(outline.stroke, Some((1.0, 0.0, 0.0)));
}

#[test]
fn grid_border_zero_removes_the_grid() {
    let (doc, diags) = styled_table("        style: { borderWidth: 0 }\n", 2);
    assert!(diags.is_empty(), "diags: {:?}", diags);
    assert!(rect_shapes(&doc.pages[0]).is_empty(), "no outline rects");
    assert!(line_shapes(&doc.pages[0]).is_empty(), "no separators");
}

#[test]
fn default_grid_is_half_point_black() {
    let (doc, diags) = styled_table("", 1);
    assert!(diags.is_empty(), "diags: {:?}", diags);
    let outline = rect_shapes(&doc.pages[0])[0];
    assert_eq!(outline.stroke_width, 0.5);
    assert_eq!(outline.stroke, Some((0.0, 0.0, 0.0)));
}

#[test]
fn huge_border_width_clamps_with_a_diagnostic() {
    let (_doc, diags) = styled_table("        style: { borderWidth: 1e9 }\n", 1);
    assert!(diags.iter().any(|d| d.code == "invalid_border_width"));
}

#[test]
fn row_fill_and_alternate_style_stripe_even_rows() {
    let (doc, diags) = styled_table(
        "        row:\n          style: { backgroundColor: \"#ffffff\" }\n          alternateStyle: { backgroundColor: \"#ff0000\" }\n",
        3,
    );
    assert!(diags.is_empty(), "diags: {:?}", diags);
    let fills: Vec<_> = rect_shapes(&doc.pages[0])
        .into_iter()
        .filter(|r| r.fill.is_some())
        .collect();
    assert_eq!(fills.len(), 3);
    // Rows 1 and 3 keep the base fill; row 2 takes the alternate.
    assert_eq!(fills[0].fill, Some((1.0, 1.0, 1.0)));
    assert_eq!(fills[1].fill, Some((1.0, 0.0, 0.0)));
    assert_eq!(fills[2].fill, Some((1.0, 1.0, 1.0)));
    // Each fill is a full row band.
    assert_eq!((fills[1].x, fills[1].w, fills[1].h), (0.0, 100.0, 24.0));
}

#[test]
fn zebra_style_names_resolve_from_the_registry() {
    let items: Vec<Value> = (1..=2).map(|i| json!({"n": i})).collect();
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
styles:
  stripe: { backgroundColor: "#0000ff" }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: table
        data: { key: items }
        row: { alternateStyleNames: [stripe] }
        columns:
          - data: { key: n }
            width: 100
"##,
        json!({ "items": items }),
    );
    assert!(diags.is_empty(), "diags: {:?}", diags);
    let fills: Vec<_> = rect_shapes(&doc.pages[0])
        .into_iter()
        .filter(|r| r.fill.is_some())
        .collect();
    // Only the second row is striped.
    assert_eq!(fills.len(), 1);
    assert_eq!(fills[0].fill, Some((0.0, 0.0, 1.0)));
    assert_eq!(fills[0].y, 24.0);
}

#[test]
fn grid_border_resolves_from_named_styles() {
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
styles:
  grid: { borderWidth: 2, borderColor: "#ff0000" }
  topAligned: { verticalAlign: top }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: table
        data: { key: items }
        styleNames: [grid]
        row: { height: 40 }
        columns:
          - data: { key: n }
            width: 100
            styleNames: [topAligned]
"##,
        json!({ "items": [ {"n": "x"} ] }),
    );
    assert!(diags.is_empty(), "diags: {:?}", diags);
    // The registry-sourced grid border applies…
    let outline = rect_shapes(&doc.pages[0])
        .into_iter()
        .find(|r| r.stroke.is_some())
        .expect("outline");
    assert_eq!(outline.stroke_width, 2.0);
    assert_eq!(outline.stroke, Some((1.0, 0.0, 0.0)));
    // …and so does the registry-sourced cell verticalAlign (top pins the
    // line at the 4pt padding instead of centering in the 40pt row).
    assert_eq!(cell_pos(&doc.pages[0], "x").1, 4.0);
}

#[test]
fn undefined_style_names_fall_back_to_the_table_defaults() {
    // `validate` reports the unknown names; layout skips them silently
    // and keeps the default grid and cell alignment.
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
        styleNames: [ghostTable]
        columns:
          - data: { key: n }
            width: 100
            styleNames: [ghostColumn]
"#,
        json!({ "items": [ {"n": "x"} ] }),
    );
    assert!(diags.is_empty(), "layout emits no diagnostic: {:?}", diags);
    let outline = rect_shapes(&doc.pages[0])[0];
    assert_eq!(outline.stroke_width, 0.5);
    // Default middle alignment in the 24pt row: 4 + (16 - 14) / 2.
    assert_eq!(cell_pos(&doc.pages[0], "x").1, 5.0);
}

#[test]
fn table_style_cascades_inherited_properties_but_not_background() {
    let (doc, diags) = styled_table(
        "        style: { fontSize: 8, backgroundColor: \"#00ff00\" }\n",
        1,
    );
    assert!(diags.is_empty(), "diags: {:?}", diags);
    // fontSize inherits into the cell text.
    assert_eq!(text_blocks(&doc.pages[0])[0].font_size, 8.0);
    // backgroundColor is not inherited: no green fill anywhere.
    assert!(!rect_shapes(&doc.pages[0])
        .iter()
        .any(|r| r.fill == Some((0.0, 1.0, 0.0))));
}

#[test]
fn header_fill_defaults_to_gray_and_takes_an_override() {
    let header_table = |style: &str| {
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
{style}        columns:
          - label: 名前
            data: {{ key: n }}
            width: 100
"#
            ),
            json!({ "items": [ {"n": 1} ] }),
        )
    };
    let (doc, _) = header_table("");
    let fill = rect_shapes(&doc.pages[0])
        .into_iter()
        .find(|r| r.fill.is_some())
        .expect("header fill");
    let (r, g, b) = fill.fill.expect("fill");
    assert_eq!(
        [
            (r * 255.0).round(),
            (g * 255.0).round(),
            (b * 255.0).round()
        ],
        [237.0, 237.0, 237.0],
        "#ededed default"
    );

    let (doc, diags) =
        header_table("        header:\n          style: { backgroundColor: \"#0000ff\" }\n");
    assert!(diags.is_empty(), "diags: {:?}", diags);
    let fills: Vec<_> = rect_shapes(&doc.pages[0])
        .into_iter()
        .filter(|r| r.fill.is_some())
        .collect();
    assert_eq!(fills.len(), 1);
    assert_eq!(fills[0].fill, Some((0.0, 0.0, 1.0)));
}

#[test]
fn invalid_row_fill_color_warns_and_fills_nothing() {
    let (doc, diags) = styled_table(
        "        row:\n          style: { backgroundColor: nope }\n",
        1,
    );
    assert!(diags.iter().any(|d| d.code == "invalid_color"));
    assert!(!rect_shapes(&doc.pages[0]).iter().any(|r| r.fill.is_some()));
}

#[test]
fn hostile_cell_font_size_warns_once_after_dedup() {
    // A hostile fontSize cascading into table cells is resolved by both
    // the measure pass and the render pass; the two identical warnings
    // collapse to one at the layout output boundary (`Diagnostics::dedup`).
    let (_doc, diags) = styled_table("        style: { fontSize: -5 }\n", 1);
    assert_eq!(
        diags
            .iter()
            .filter(|d| d.code == "invalid_font_size")
            .count(),
        1,
        "measure + render double warn must dedup: {diags:?}"
    );
}
