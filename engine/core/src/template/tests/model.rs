//! Model behaviors: page sizes, containers, images, repeat items.

use super::*;

#[test]
fn landscape_swaps_dimensions() {
    let spec = PageSpec {
        size: PageSize::A4,
        orientation: Orientation::Landscape,
        margin: PageMargin::uniform_pt(0.0),
    };
    assert_eq!(spec.dimensions_pt(), (841.89, 595.28));
}

#[test]
fn letter_page_size() {
    assert_eq!(PageSize::Letter.dimensions_pt(), (612.0, 792.0));
}

#[test]
fn custom_page_size_parses() {
    let tpl = parse_template(
        r#"
page:
  size: { w: 226.77, h: 623.62 }
sections:
  body:
    type: absolute
    items: []
"#,
    )
    .expect("template");
    assert_eq!(tpl.page.dimensions_pt(), (226.77, 623.62));
}

#[test]
fn physical_custom_page_size_parses_and_round_trips() {
    let tpl = parse_template(
        r#"
page:
  size: { w: 80mm, h: 220mm }
sections:
  body:
    type: absolute
    items: []
"#,
    )
    .expect("template");
    let (w, h) = tpl.page.dimensions_pt();
    assert!((w - 226.771_653).abs() < 1e-6);
    assert!((h - 623.622_047).abs() < 1e-6);
    // North star: the authored unit survives serialization.
    let out = serde_yaml::to_string(&tpl).expect("yaml");
    assert!(
        out.contains("w: 80mm") && out.contains("h: 220mm"),
        "got: {out}"
    );
}

#[test]
fn custom_page_size_rejects_bad_dimensions() {
    for bad in [
        "{ w: 0, h: 100 }",
        "{ w: -5, h: 100 }",
        "{ w: 100, h: 20000 }",
        "{ w: \"50%\", h: 100 }",
        "{ w: \"300in\", h: 100 }",
        "{ w: \"0mm\", h: 100 }",
        "B6",
    ] {
        let yaml = format!(
            "page:\n  size: {bad}\nsections:\n  body:\n    type: absolute\n    items: []\n"
        );
        assert!(parse_template(&yaml).is_err(), "expected rejection: {bad}");
    }
}

#[test]
fn page_size_serializes_back_to_wire_form() {
    assert_eq!(
        serde_yaml::to_string(&PageSize::A4).expect("yaml").trim(),
        "A4"
    );
    assert_eq!(
        serde_yaml::to_string(&PageSize::Letter)
            .expect("yaml")
            .trim(),
        "Letter"
    );
    let custom = serde_yaml::to_string(&PageSize::Custom {
        w: Length::Pt(100.0),
        h: Length::Pt(200.0),
    })
    .expect("yaml");
    assert!(custom.contains("w: 100.0") && custom.contains("h: 200.0"));
    // A hand-constructed `%` (unreachable from a template) degrades to a
    // zero dimension instead of panicking.
    let pct = PageSize::Custom {
        w: Length::Percent(50.0),
        h: Length::Pt(200.0),
    };
    assert_eq!(pct.dimensions_pt(), (0.0, 200.0));
}

#[test]
fn page_size_error_truncates_hostile_names() {
    let long = "x".repeat(10_000);
    let yaml =
        format!("page:\n  size: {long}\nsections:\n  body:\n    type: absolute\n    items: []\n");
    let err = parse_template(&yaml).expect_err("rejected").to_string();
    assert!(err.len() < 300, "unbounded echo: {} bytes", err.len());
}

#[test]
fn container_parses_with_percent_lengths_and_nesting() {
    let tpl = parse_template(
        r#"
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 25, y: 100, w: "50%" }
        items:
          - type: container
            box: { x: "0%", y: "10%", w: "100%", h: 40 }
            items:
              - type: text
                box: { x: "5%", w: "50%" }
                text: nested
"#,
    )
    .expect("template");
    let Body::Absolute(abs) = &tpl.sections.body else { panic!("expected absolute") };
    let Item::Container(outer) = &abs.items[0] else { panic!("expected container") };
    let b = outer.box_.clone().expect("box");
    assert_eq!(b.x, Some(Length::Pt(25.0)));
    assert_eq!(b.w, Some(Length::Percent(50.0)));
    assert_eq!(b.h, None);
    let Item::Container(inner) = &outer.items[0] else { panic!("expected nested container") };
    assert_eq!(
        inner.box_.clone().expect("box").y,
        Some(Length::Percent(10.0))
    );
    let Item::Text(text) = &inner.items[0] else { panic!("expected text") };
    assert_eq!(
        text.box_.clone().expect("box").w,
        Some(Length::Percent(50.0))
    );
}

#[test]
fn deeply_nested_containers_fail_parsing_not_the_stack() {
    // serde_yaml's recursion limit bounds template depth; a hostile
    // 200-deep container chain must error, never overflow the stack.
    let mut yaml = String::from("sections:\n  body:\n    type: absolute\n    items:\n");
    let mut indent = String::from("      ");
    for _ in 0..200 {
        yaml.push_str(&format!("{indent}- type: container\n{indent}  items:\n"));
        indent.push_str("    ");
    }
    assert!(parse_template(&yaml).is_err());
}

#[test]
fn image_item_parses_with_fit_default() {
    let tpl = parse_template(
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 100 }
    items:
      - type: image
        box: { w: 40, h: 20 }
        src: assets/logo.svg
      - type: image
        fit: stretch
        data: { key: qr_code }
"#,
    )
    .expect("template");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    let Item::Image(logo) = &flow.items[0] else { panic!("expected image") };
    assert_eq!(logo.src.as_deref(), Some("assets/logo.svg"));
    assert_eq!(logo.fit(), ImageFit::Contain);
    assert!(logo.data.is_none());
    let Item::Image(qr) = &flow.items[1] else { panic!("expected image") };
    assert_eq!(qr.fit(), ImageFit::Stretch);
    assert_eq!(qr.data.as_ref().map(|b| b.key.as_str()), Some("qr_code"));
}

#[test]
fn page_number_format_defaults() {
    let tpl = parse_template(
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 100 }
    items: []
  footer:
    items:
      - type: page_number
"#,
    )
    .expect("template");
    let footer = tpl.sections.footer.as_ref().expect("footer");
    let Item::PageNumber(pn) = &footer.items[0] else { panic!("expected page_number") };
    assert_eq!(pn.format(), "{page} / {pages}");
}

#[test]
fn repeat_applies_to() {
    assert!(Repeat::EveryPage.applies_to(2, 3));
    assert!(Repeat::FirstPage.applies_to(1, 3));
    assert!(!Repeat::FirstPage.applies_to(2, 3));
    assert!(Repeat::ExceptFirstPage.applies_to(2, 3));
    assert!(!Repeat::ExceptFirstPage.applies_to(1, 3));
    assert!(Repeat::LastPage.applies_to(3, 3));
    assert!(!Repeat::LastPage.applies_to(2, 3));
}

#[test]
fn repeat_item_parses_grid_and_cell_and_round_trips() {
    let yaml = r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - id: receipts
        type: repeat
        data: { key: receipts }
        grid:
          columns: 2
          rows: 2
          direction: column
          columnGap: 10
          rowGap: "5%"
        cell:
          style: { fontSize: 9 }
          items:
            - type: text
              data: { key: order_code }
"#;
    let tpl = parse_template(yaml).expect("parse");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    assert_eq!(flow.items[0].id(), Some("receipts"));
    let Item::Repeat(rep) = &flow.items[0] else { panic!("expected repeat") };
    assert_eq!(rep.data.key, "receipts");
    assert_eq!(rep.grid.columns(), 2);
    assert_eq!(rep.grid.rows(), 2);
    assert_eq!(rep.grid.direction(), GridDirection::Column);
    assert_eq!(rep.grid.column_gap(), Some(Length::Pt(10.0)));
    assert_eq!(rep.grid.row_gap(), Some(Length::Percent(5.0)));
    assert_eq!(rep.cell.style.font_size, Some(Length::Pt(9.0)));
    let Item::Text(t) = &rep.cell.items[0] else { panic!("expected cell text") };
    assert_eq!(t.data.as_ref().map(|b| b.key.as_str()), Some("order_code"));
    // Round-trip preserves the grid and cell.
    let out = serde_yaml::to_string(&tpl).expect("yaml");
    let reparsed = parse_template(&out).expect("reparse");
    let Body::Flow(flow2) = &reparsed.sections.body else { panic!("flow") };
    let Item::Repeat(rep2) = &flow2.items[0] else { panic!("repeat") };
    assert_eq!(rep2.grid.direction(), GridDirection::Column);
    assert_eq!(rep2.grid.column_gap(), Some(Length::Pt(10.0)));
}

#[test]
fn repeat_grid_defaults_to_single_cell() {
    let yaml = r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: repeat
        data: { key: rows }
        cell:
          items: []
"#;
    let tpl = parse_template(yaml).expect("parse");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("flow") };
    let Item::Repeat(rep) = &flow.items[0] else { panic!("repeat") };
    assert_eq!(rep.grid.columns(), 1);
    assert_eq!(rep.grid.rows(), 1);
    assert_eq!(rep.grid.direction(), GridDirection::Row);
    assert!(rep.grid.column_gap().is_none() && rep.grid.row_gap().is_none());
    // An all-default grid does not serialize its gap fields back.
    let out = serde_yaml::to_string(&tpl).expect("yaml");
    assert!(!out.contains("columnGap"), "got: {out}");
}
