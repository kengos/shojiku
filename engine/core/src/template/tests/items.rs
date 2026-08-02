//! Parsing and round-trip serialization of the item-specific wire
//! forms: image style, qr_code, and list.

use super::super::*;

#[test]
fn image_style_and_style_names_parse_and_round_trip() {
    // Images carry `style`/`styleNames` for box decoration (D1); unset
    // they serialize to nothing, set they round-trip.
    let tpl = parse_template(
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 100 }
    items:
      - type: image
        box: { w: 10, h: 10 }
        src: logo.png
        styleNames: [framed]
        style: { borderWidth: 1.5, backgroundColor: '#eeeeee' }
      - type: image
        box: { w: 10, h: 10 }
        src: logo.png
"#,
    )
    .expect("template");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    let Item::Image(styled) = &flow.items[0] else { panic!("expected image") };
    assert_eq!(styled.style_names, vec!["framed".to_string()]);
    assert_eq!(
        styled.style.border_width,
        Some(crate::style::BorderWidth::All(1.5))
    );
    assert_eq!(styled.style.background_color.as_deref(), Some("#eeeeee"));
    let yaml = serde_yaml::to_string(&tpl).expect("yaml");
    assert!(yaml.contains("borderWidth: 1.5"), "got: {yaml}");
    // The unstyled image serializes no style keys.
    assert_eq!(yaml.matches("styleNames").count(), 1, "got: {yaml}");
    assert_eq!(yaml.matches("style:").count(), 1, "got: {yaml}");
}

#[test]
fn qr_code_parses_with_defaults_and_round_trips() {
    let tpl = parse_template(
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 100 }
    items:
      - type: qr_code
        box: { w: 40, h: 40 }
        text: "https://x.example/t/{token}"
      - type: qr_code
        box: { w: 40, h: 40 }
        data: { key: token }
        errorCorrection: high
        styleNames: [backing]
"#,
    )
    .expect("template");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    let Item::QrCode(first) = &flow.items[0] else { panic!("expected qr_code") };
    assert_eq!(first.error_correction(), EcLevel::Medium, "default level");
    assert!(first.data.is_none());
    let Item::QrCode(second) = &flow.items[1] else { panic!("expected qr_code") };
    assert_eq!(second.error_correction(), EcLevel::High);
    assert_eq!(second.style_names, vec!["backing".to_string()]);
    let yaml = serde_yaml::to_string(&tpl).expect("yaml");
    assert!(yaml.contains("errorCorrection: high"), "got: {yaml}");
    // The defaulted level does not serialize on the first item (AA2):
    // only the authored `high` appears.
    assert_eq!(yaml.matches("errorCorrection").count(), 1, "got: {yaml}");
}

#[test]
fn qr_code_rejects_unknown_error_correction() {
    let bad = r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 100 }
    items:
      - type: qr_code
        box: { w: 40, h: 40 }
        text: t
        errorCorrection: ultra
"#;
    assert!(parse_template(bad).is_err());
}

#[test]
fn list_parses_with_defaults_and_round_trips() {
    let tpl = parse_template(
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 100 }
    items:
      - type: list
        box: { w: 100, h: 60 }
        data: { key: items }
        text: "{name} ×{quantity}"
        overflowText: "他{count}件"
      - type: list
        data: { key: items }
"#,
    )
    .expect("template");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    let Item::List(first) = &flow.items[0] else { panic!("expected list") };
    assert_eq!(first.overflow_text.as_deref(), Some("他{count}件"));
    assert_eq!(first.text.as_deref(), Some("{name} ×{quantity}"));
    let Item::List(second) = &flow.items[1] else { panic!("expected list") };
    assert!(second.overflow_text.is_none(), "default is engine-side");
    assert!(second.text.is_none());
    let yaml = serde_yaml::to_string(&tpl).expect("yaml");
    assert!(yaml.contains("overflowText:"), "got: {yaml}");
    assert_eq!(yaml.matches("overflowText").count(), 1, "got: {yaml}");
}

#[test]
fn page_break_parses_with_optional_id() {
    let tpl = parse_template(
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 100 }
    items:
      - type: page_break
      - { type: page_break, id: chapter_end }
"#,
    )
    .expect("template");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    let Item::PageBreak(first) = &flow.items[0] else { panic!("expected page_break") };
    assert!(first.id.is_none());
    assert_eq!(flow.items[1].id(), Some("chapter_end"));
    // Round-trip: the bare break serializes to just its type tag.
    let yaml = serde_yaml::to_string(&tpl).expect("yaml");
    assert_eq!(yaml.matches("page_break").count(), 2, "got: {yaml}");
}

#[test]
fn binding_placeholder_parses_and_round_trips() {
    let tpl = parse_template(
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 100 }
    items:
      - type: text
        data: { key: birth_date, format: wareki, placeholder: "　年　月　日" }
      - type: text
        data: { key: full_name }
"#,
    )
    .expect("template");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    let Item::Text(first) = &flow.items[0] else { panic!("expected text") };
    assert_eq!(
        first.data.as_ref().unwrap().placeholder.as_deref(),
        Some("　年　月　日")
    );
    // Serialize the item node alone — a template-wide check would trip on
    // neighbors' injected defaults, not this key.
    let node = serde_yaml::to_string(&flow.items[0]).expect("yaml");
    assert!(node.contains("placeholder:"), "got: {node}");
    // The unset binding serializes no placeholder key.
    let bare = serde_yaml::to_string(&flow.items[1]).expect("yaml");
    assert!(!bare.contains("placeholder"), "got: {bare}");
}

#[test]
fn binding_rejects_unknown_key() {
    // deny_unknown_fields: a typo beside `placeholder` is a parse error,
    // never a silent drop.
    let bad = r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 100 }
    items:
      - type: text
        data: { key: x, zzz: nope }
"#;
    assert!(parse_template(bad).is_err());
}
