//! Parsing and round-trip serialization of the template document.

use super::*;
use crate::{CoreError, MAX_INPUT_BYTES};

const SAMPLE: &str = r#"
version: 0.1.0
name: sample
page:
  size: A4
  orientation: portrait
  margin: [25, 25, 25, 25]
sections:
  header:
    repeat: every_page
    height: 80
    items:
      - id: title
        type: text
        box: { x: 25, y: 45, w: 545.28, h: 24 }
        text: 領収書
        style:
          fontSize: 24
          textAlign: center
  body:
    type: flow
    box: { x: 25, y: 100, w: 545.28, h: 650 }
    gap: 8
    items:
      - id: order_items_table
        type: table
        data: { key: order_items }
        columns:
          - id: name
            label: 商品名
            data: { key: ordered_product_name }
            width: 300
          - id: quantity
            label: 数量
            data: { key: quantity }
            width: 80
            style: { textAlign: right }
  footer:
    repeat: every_page
    height: 40
    items:
      - id: page_no
        type: page_number
        box: { x: 25, y: 805, w: 545.28, h: 14 }
        format: "{page} / {pages}"
"#;

#[test]
fn parses_sample_template() {
    let tpl = parse_template(SAMPLE).expect("parse");
    assert_eq!(tpl.name.as_deref(), Some("sample"));
    assert_eq!(tpl.page.dimensions_pt(), (595.28, 841.89));

    let header = tpl.sections.header.as_ref().expect("header");
    assert_eq!(header.items.len(), 1);
    let Item::Text(t) = &header.items[0] else { panic!("expected text item") };
    assert_eq!(t.text.as_deref(), Some("領収書"));
    assert_eq!(t.style.font_size, Some(Length::Pt(24.0)));
    assert_eq!(t.style.text_align, Some(TextAlign::Center));

    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow body") };
    assert_eq!(flow.gap(), Some(Length::Pt(8.0)));
    let Item::Table(t) = &flow.items[0] else { panic!("expected table") };
    assert_eq!(t.data.key, "order_items");
    assert_eq!(t.columns.len(), 2);
    // Unset on the wire (round-trip: nothing to re-serialize), effective
    // defaults through the accessors.
    assert_eq!(t.auto_page_break, None);
    assert!(t.auto_page_break());
    assert!(t.repeat_header());
    assert_eq!(t.columns[1].style.text_align, Some(TextAlign::Right));
}

#[test]
fn parses_style_on_container_and_text() {
    let yaml = r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 100 }
    items:
      - type: container
        style: { lineBreak: anywhere }
        items:
          - type: text
            text: hi
            style: { lineBreak: normal }
      - type: text
        text: plain
"#;
    let tpl = parse_template(yaml).expect("parse");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("flow") };
    let Item::Container(c) = &flow.items[0] else { panic!("container") };
    assert_eq!(c.style.line_break, Some(LineBreak::Anywhere));
    let Item::Text(t) = &c.items[0] else { panic!("text") };
    assert_eq!(t.style.line_break, Some(LineBreak::Normal));
    // An item that omits `style` parses as empty (all inherit).
    let Item::Text(plain) = &flow.items[1] else { panic!("text") };
    assert_eq!(plain.style.line_break, None);
    assert!(plain.style.is_empty());
}

#[test]
fn styles_registry_and_style_names_parse_and_round_trip() {
    let yaml = r##"
styles:
  emphasis: { fontSize: 14, color: "#c00" }
  muted: { color: "#999" }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: hi
        styleNames: [muted, emphasis]
        style: { textAlign: right }
"##;
    let tpl = parse_template(yaml).expect("parse");
    assert_eq!(tpl.styles.len(), 2);
    assert_eq!(tpl.styles["emphasis"].font_size, Some(Length::Pt(14.0)));
    let Body::Absolute(abs) = &tpl.sections.body else { panic!("absolute") };
    let Item::Text(t) = &abs.items[0] else { panic!("text") };
    assert_eq!(t.style_names, vec!["muted", "emphasis"]);
    // Round-trip preserves the registry and the (ordered) references.
    let out = serde_yaml::to_string(&tpl).expect("yaml");
    assert!(out.contains("styleNames:"), "got: {out}");
    assert!(out.contains("emphasis:"), "got: {out}");
    let reparsed = parse_template(&out).expect("reparse");
    let Body::Absolute(abs2) = &reparsed.sections.body else { panic!("absolute") };
    let Item::Text(t2) = &abs2.items[0] else { panic!("text") };
    assert_eq!(t2.style_names, vec!["muted", "emphasis"]);
}

#[test]
fn absent_style_names_and_registry_are_skipped_on_serialization() {
    let tpl = parse_template(
        "sections:\n  body:\n    type: absolute\n    items:\n      - { type: text, text: hi }\n",
    )
    .expect("parse");
    let yaml = serde_yaml::to_string(&tpl).expect("yaml");
    assert!(!yaml.contains("styleNames"), "got: {yaml}");
    assert!(!yaml.contains("styles:"), "got: {yaml}");
}

#[test]
fn empty_style_is_skipped_on_serialization() {
    // A text item with no style round-trips without an empty `style:`.
    let tpl = parse_template(
        "sections:\n  body:\n    type: absolute\n    items:\n      - { type: text, text: hi }\n",
    )
    .expect("parse");
    let yaml = serde_yaml::to_string(&tpl).expect("yaml");
    assert!(!yaml.contains("style"), "got: {yaml}");
}

#[test]
fn item_id_covers_every_variant() {
    let tpl = parse_template(
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 100 }
    items:
      - { type: text, id: t }
      - { type: rect, id: r, box: { w: 1, h: 1 } }
      - { type: line, id: l, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }
      - id: tbl
        type: table
        data: { key: k }
        columns: []
      - { type: page_number, id: p }
      - { type: image, id: img, box: { w: 10, h: 10 }, src: logo.png }
      - { type: container, id: c }
      - { type: qr_code, id: q, box: { w: 10, h: 10 }, text: t }
      - { type: list, id: ls, data: { key: k } }
      - { type: page_break, id: pb }
      - { type: text }
"#,
    )
    .expect("template");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    let ids: Vec<Option<&str>> = flow.items.iter().map(Item::id).collect();
    assert_eq!(
        ids,
        vec![
            Some("t"),
            Some("r"),
            Some("l"),
            Some("tbl"),
            Some("p"),
            Some("img"),
            Some("c"),
            Some("q"),
            Some("ls"),
            Some("pb"),
            None
        ]
    );
}

#[test]
fn rejects_non_finite_numbers() {
    let bad = r#"
sections:
  body:
    type: flow
    box: { x: .inf, y: 0, w: .nan, h: 700 }
    items: []
"#;
    let err = parse_template(bad).expect_err("non-finite must be rejected");
    assert!(err.to_string().contains("non-finite"), "got: {err}");
}

#[test]
fn rejects_non_finite_style_numbers() {
    // fontSize/lineHeight are now Option<f64>; the pre-deserialize
    // finite guard must still catch .nan/.inf inside a `style:` block.
    let bad = r#"
sections:
  body:
    type: absolute
    items:
      - type: text
        text: hi
        style: { fontSize: .nan, lineHeight: .inf }
"#;
    let err = parse_template(bad).expect_err("non-finite style must be rejected");
    assert!(err.to_string().contains("non-finite"), "got: {err}");
}

#[test]
fn rejects_unknown_item_type() {
    let bad = r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 100 }
    items:
      - type: hologram
"#;
    assert!(parse_template(bad).is_err());
}

/// One test per door, so a cap added to `parse_checked` and forgotten at a
/// door that bypasses it cannot pass unnoticed.
#[test]
fn an_oversize_template_is_refused_before_either_parse() {
    // The fixture is BOTH oversize and syntactically broken. If the size
    // check ran after the YAML parse we would get `Parse`; getting
    // `TooLarge` is what proves the bound sits ahead of the reads — and
    // `parse_checked` reads the source TWICE, so a bound applied later
    // would already have paid the cost it exists to avoid.
    let oversize = format!("sections: [unterminated\n{}", "#".repeat(MAX_INPUT_BYTES));
    let err = parse_template(&oversize).expect_err("must refuse");
    assert!(
        matches!(
            err,
            CoreError::TooLarge {
                what: "template",
                ..
            }
        ),
        "got: {err:?}"
    );
}

#[test]
fn a_template_at_the_cap_is_still_parsed() {
    // The other half of the boundary: the admitted maximum must WORK, not
    // merely avoid the refusal.
    let doc = "page: { size: A4 }\nsections:\n  body:\n    type: flow\n    box: { x: 0, y: 0, w: 100, h: 100 }\n    items: []\n";
    let template = format!("{doc}{}", "#".repeat(MAX_INPUT_BYTES - doc.len()));
    assert_eq!(template.len(), MAX_INPUT_BYTES);
    parse_template(&template).expect("the admitted maximum must parse");
}
