//! Parsing and round-trip serialization of the table wire: Length
//! widths/heights, the style layers, effective defaults, and the
//! deny-unknown-fields typo safety of all four table structs.

use super::super::*;
use crate::length::Length;

fn table_yaml(table_body: &str) -> String {
    format!(
        "sections:\n  body:\n    type: flow\n    box: {{ x: 0, y: 0, w: 500, h: 700 }}\n    items:\n      - type: table\n{table_body}"
    )
}

fn parse_table(table_body: &str) -> TableItem {
    let tpl = parse_template(&table_yaml(table_body)).expect("template");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    let Item::Table(t) = &flow.items[0] else { panic!("expected table") };
    (**t).clone()
}

#[test]
fn column_width_takes_every_length_form_or_none() {
    let t = parse_table(
        r#"        data: { key: rows }
        columns:
          - { data: { key: a }, width: 100 }
          - { data: { key: b }, width: "40%" }
          - { data: { key: c }, width: "20mm" }
          - { data: { key: d } }
"#,
    );
    assert_eq!(t.columns[0].width, Some(Length::Pt(100.0)));
    assert_eq!(t.columns[1].width, Some(Length::Percent(40.0)));
    assert!(matches!(t.columns[2].width, Some(Length::Physical(v, _)) if v == 20.0));
    assert_eq!(t.columns[3].width, None);
}

#[test]
fn invalid_column_width_string_is_a_parse_error() {
    let yaml = table_yaml(
        r#"        data: { key: rows }
        columns:
          - { data: { key: a }, width: "wide" }
"#,
    );
    let err = parse_template(&yaml).expect_err("invalid length");
    assert!(err.to_string().contains("invalid length"), "got: {err}");
}

#[test]
fn row_and_header_heights_are_lengths_with_effective_defaults() {
    let t = parse_table(
        r#"        data: { key: rows }
        keepTogether: true
        row:
          minHeight: "10mm"
          height: "5%"
        header:
          height: 40
        columns:
          - { data: { key: a }, width: 100 }
"#,
    );
    assert!(matches!(t.row.min_height, Some(Length::Physical(v, _)) if v == 10.0));
    assert_eq!(t.row.height, Some(Length::Percent(5.0)));
    assert_eq!(
        t.header.as_ref().and_then(|h| h.height),
        Some(Length::Pt(40.0))
    );
    assert!(t.keep_together());

    // Effective defaults when unset.
    let bare = parse_table(
        "        data: { key: rows }\n        columns:\n          - { data: { key: a } }\n",
    );
    assert_eq!(bare.row.min_height(), Length::Pt(24.0));
    assert_eq!(bare.row.height, None);
    assert!(!bare.keep_together());
    assert!(bare.auto_page_break());
    assert!(bare.repeat_header());
    assert_eq!(bare.cell_padding(), 4.0);
    assert_eq!(bare.empty_behavior(), EmptyBehavior::Collapse);
}

#[test]
fn minimal_table_round_trips_without_injected_defaults() {
    let tpl = parse_template(&table_yaml(
        "        data: { key: rows }\n        columns:\n          - { data: { key: a } }\n",
    ))
    .expect("template");
    let yaml = serde_yaml::to_string(&tpl).expect("yaml");
    // (`sections.header: null` is a pre-existing template-level wart, so
    // `header` is asserted via the table-specific keys only.)
    for absent in [
        "autoPageBreak",
        "repeatHeader",
        "keepTogether",
        "emptyBehavior",
        "cellPadding",
        "row:",
        "width",
    ] {
        assert!(!yaml.contains(absent), "`{absent}` injected: {yaml}");
    }
}

#[test]
fn table_styles_and_zebra_round_trip_in_authored_form() {
    let tpl = parse_template(&table_yaml(
        r##"        data: { key: rows }
        styleNames: [tableBase]
        style: { borderWidth: 1, borderColor: "#cccccc" }
        row:
          styleNames: [rowBase]
          style: { backgroundColor: "#ffffff" }
          alternateStyleNames: [rowAlt]
          alternateStyle: { backgroundColor: "#f5f5f5" }
        columns:
          - { data: { key: a }, width: "50%" }
"##,
    ))
    .expect("template");
    let yaml = serde_yaml::to_string(&tpl).expect("yaml");
    // Authored forms survive: names, the zebra keys, and the % width.
    for present in [
        "tableBase",
        "rowBase",
        "alternateStyleNames",
        "alternateStyle",
        "50%",
    ] {
        assert!(yaml.contains(present), "`{present}` lost: {yaml}");
    }
    let reparsed = parse_template(&yaml).expect("reparse");
    let Body::Flow(flow) = &reparsed.sections.body else { panic!("flow") };
    let Item::Table(t) = &flow.items[0] else { panic!("table") };
    assert_eq!(t.row.alternate_style_names, vec!["rowAlt".to_string()]);
    assert_eq!(
        t.row.alternate_style.background_color.as_deref(),
        Some("#f5f5f5")
    );
}

#[test]
fn unknown_keys_are_rejected_in_every_table_struct() {
    // One typo per struct: TableItem, Column, RowSpec, TableHeaderSpec.
    let cases = [
        "        data: { key: rows }\n        gap: 4\n        columns: []\n",
        "        data: { key: rows }\n        columns:\n          - { data: { key: a }, widht: 100 }\n",
        "        data: { key: rows }\n        row: { minheight: 10 }\n        columns: []\n",
        "        data: { key: rows }\n        header: { hight: 40 }\n        columns: []\n",
    ];
    for case in cases {
        let err = parse_template(&table_yaml(case)).expect_err("unknown key must fail");
        assert!(err.to_string().contains("unknown field"), "got: {err}");
    }
}

#[test]
fn header_groups_and_merge_empty_cells_parse_and_round_trip() {
    let t = parse_table(concat!(
        "        data: { key: rows }\n",
        "        mergeEmptyCells: true\n",
        "        headerGroups:\n",
        "          - { label: 期間, span: 2 }\n",
        "          - { label: 事項, span: 1, style: { fontWeight: bold } }\n",
        "        columns: []\n",
    ));
    assert!(t.merge_empty_cells());
    assert_eq!(t.header_groups.len(), 2);
    assert_eq!(t.header_groups[0].label.as_deref(), Some("期間"));
    assert_eq!(t.header_groups[0].span, 2);
    // Round-trip: only authored keys serialize.
    let yaml = serde_yaml::to_string(&t).expect("yaml");
    assert!(yaml.contains("mergeEmptyCells: true"), "got: {yaml}");
    assert!(yaml.contains("span: 2"), "got: {yaml}");
    // A table without either key serializes neither.
    let plain = parse_table("        data: { key: rows }\n        columns: []\n");
    assert!(!plain.merge_empty_cells());
    let yaml = serde_yaml::to_string(&plain).expect("yaml");
    assert!(!yaml.contains("mergeEmptyCells") && !yaml.contains("headerGroups"));
}

#[test]
fn visually_hidden_parses_defaults_and_round_trips() {
    // The accessor's `false` arm is exercised HERE, in core's own test binary:
    // its only library caller lives in `shojiku-layout`, so without this the
    // line is covered only in the copy linked into that crate's tests.
    let plain = parse_table("        data: { key: rows }\n        columns: []\n");
    assert!(plain.header.is_none());
    let shown = parse_table(concat!(
        "        data: { key: rows }\n",
        "        header: { visuallyHidden: false }\n",
        "        columns: []\n",
    ));
    assert!(!shown.header.as_ref().expect("header").visually_hidden());
    let hidden = parse_table(concat!(
        "        data: { key: rows }\n",
        "        header: { visuallyHidden: true }\n",
        "        columns: []\n",
    ));
    assert!(hidden.header.as_ref().expect("header").visually_hidden());
    // An authored key round-trips; an ABSENT one serializes nothing, which is
    // what makes an untouched document byte-identical.
    let yaml = serde_yaml::to_string(&hidden).expect("yaml");
    assert!(yaml.contains("visuallyHidden: true"), "got: {yaml}");
    let yaml = serde_yaml::to_string(&plain).expect("yaml");
    assert!(!yaml.contains("visuallyHidden"), "got: {yaml}");
}

#[test]
fn visually_hidden_rejects_a_non_boolean() {
    // The wire is `Option<bool>`, not "anything truthy": a string or a number
    // must fail to parse rather than resolve to a silent `false`.
    for bad in ["\"true\"", "1", "[]"] {
        let err = parse_template(&table_yaml(&format!(
            "        data: {{ key: rows }}\n        header: {{ visuallyHidden: {bad} }}\n        columns: []\n"
        )))
        .expect_err("a non-boolean must fail");
        // serde names the TYPE mismatch, not the key: "invalid type: string
        // \"true\", expected a boolean". That phrase is the claim worth
        // pinning — a truthy string must not resolve to `true`.
        assert!(err.to_string().contains("expected a boolean"), "got: {err}");
    }
}

#[test]
fn header_group_rejects_unknown_keys_and_missing_span() {
    let err = parse_template(&table_yaml(
        "        data: { key: rows }\n        headerGroups:\n          - { label: a, span: 1, zzz: 1 }\n        columns: []\n",
    ))
    .expect_err("unknown key");
    assert!(err.to_string().contains("unknown field"), "got: {err}");
    let err = parse_template(&table_yaml(
        "        data: { key: rows }\n        headerGroups:\n          - { label: a }\n        columns: []\n",
    ))
    .expect_err("missing span");
    assert!(err.to_string().contains("span"), "got: {err}");
}

#[test]
fn column_type_and_fit_parse_and_round_trip() {
    let t = parse_table(concat!(
        "        data: { key: rows }\n",
        "        columns:\n",
        "          - { data: { key: code }, type: qr_code, width: 60 }\n",
        "          - { data: { key: photo }, type: image, fit: cover }\n",
        "          - { data: { key: name } }\n",
    ));
    assert_eq!(t.columns[0].column_type(), ColumnType::QrCode);
    assert_eq!(t.columns[1].column_type(), ColumnType::Image);
    assert_eq!(t.columns[1].fit(), crate::template::ImageFit::Cover);
    assert_eq!(t.columns[2].column_type(), ColumnType::Text);
    let yaml = serde_yaml::to_string(&t).expect("yaml");
    assert!(yaml.contains("type: qr_code") && yaml.contains("fit: cover"));
    // The default type serializes nothing.
    assert_eq!(yaml.matches("type:").count(), 2, "got: {yaml}");
}

#[test]
fn unknown_column_type_is_a_parse_error() {
    let err = parse_template(&table_yaml(
        "        data: { key: rows }\n        columns:\n          - { data: { key: a }, type: barcode }\n",
    ))
    .expect_err("unknown type");
    assert!(err.to_string().contains("unknown variant"), "got: {err}");
}

#[test]
fn table_box_parses_and_round_trips_and_is_unset_by_default() {
    // `box` is the same OptBox every item carries; unset never
    // serializes, an authored box round-trips.
    let plain =
        parse_table("        data: { key: rows }\n        columns: [ { data: { key: a } } ]\n");
    assert!(plain.box_.is_none());
    assert!(!serde_yaml::to_string(&plain)
        .expect("yaml")
        .contains("box:"));

    let boxed = parse_table(
        "        box: { x: 10, w: 200, margin: { left: auto } }\n        data: { key: rows }\n        columns: [ { data: { key: a } } ]\n",
    );
    let b = boxed.box_.as_ref().expect("box");
    assert_eq!(b.x, Some(Length::Pt(10.0)));
    assert_eq!(b.w, Some(Length::Pt(200.0)));
    let yaml = serde_yaml::to_string(&boxed).expect("yaml");
    assert!(yaml.contains("box:"), "got: {yaml}");
}
