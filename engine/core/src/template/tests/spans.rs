//! Parsing and round-trip serialization of rich-text `spans`.

use super::super::*;

#[test]
fn spans_parse_with_styles_and_bindings() {
    let tpl = parse_template(
        r##"
sections:
  body:
    type: flow
    items:
      - type: text
        box: { w: 200 }
        spans:
          - text: "合計 "
          - data: { key: total, format: currency }
            style: { fontWeight: bold, color: '#c00000' }
          - text: " (税込)"
            styleNames: [muted]
"##,
    )
    .expect("template");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    let Item::Text(text) = &flow.items[0] else { panic!("expected text") };
    assert_eq!(text.spans.len(), 3);
    assert_eq!(text.spans[0].text.as_deref(), Some("合計 "));
    let binding = text.spans[1].data.as_ref().expect("binding");
    assert_eq!(binding.key, "total");
    assert_eq!(binding.format.as_deref(), Some("currency"));
    assert_eq!(text.spans[1].style.color.as_deref(), Some("#c00000"));
    assert_eq!(text.spans[2].style_names, vec!["muted".to_string()]);
}

#[test]
fn spans_round_trip_without_injected_defaults() {
    let tpl = parse_template(
        r#"
sections:
  body:
    type: flow
    items:
      - type: text
        spans:
          - text: plain
          - text: loud
            style: { fontWeight: bold }
"#,
    )
    .expect("template");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    // Serialize the item node alone: unset span fields must not appear.
    let yaml = serde_yaml::to_string(&flow.items[0]).expect("yaml");
    assert!(yaml.contains("spans:"), "got: {yaml}");
    assert!(!yaml.contains("data:"), "got: {yaml}");
    assert!(!yaml.contains("styleNames:"), "got: {yaml}");
    // Only the styled span serializes a style.
    assert_eq!(yaml.matches("style:").count(), 1, "got: {yaml}");
    // A spans-less text item serializes no `spans` key.
    let plain = parse_template(
        "sections:\n  body:\n    type: flow\n    items:\n      - type: text\n        text: t\n",
    )
    .expect("plain");
    let Body::Flow(pf) = &plain.sections.body else { panic!("expected flow") };
    let yaml = serde_yaml::to_string(&pf.items[0]).expect("yaml");
    assert!(!yaml.contains("spans"), "got: {yaml}");
}

#[test]
fn unknown_span_key_is_a_parse_error() {
    let err = parse_template(
        r#"
sections:
  body:
    type: flow
    items:
      - type: text
        spans:
          - text: hi
            hover: tooltip
"#,
    )
    .expect_err("hover is not a span key");
    assert!(err.to_string().contains("hover"), "got: {err}");
}
