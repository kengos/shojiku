//! Parsing and round-trip serialization of the `repeat_flow` wire:
//! the data/gap/item keys and deny-unknown-fields typo safety.

use super::super::*;
use crate::length::Length;

fn rf_yaml(body: &str) -> String {
    format!(
        "sections:\n  body:\n    type: flow\n    box: {{ x: 0, y: 0, w: 500, h: 700 }}\n    items:\n      - type: repeat_flow\n{body}"
    )
}

fn parse_rf(body: &str) -> RepeatFlowItem {
    let tpl = parse_template(&rf_yaml(body)).expect("template");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    let Item::RepeatFlow(rf) = &flow.items[0] else { panic!("expected repeat_flow") };
    rf.clone()
}

#[test]
fn repeat_flow_parses_data_gap_and_item() {
    let rf = parse_rf(
        r#"        data: { key: cards }
        gap: "5%"
        item:
          box: { padding: 8 }
          items:
            - type: text
              data: { key: title }
"#,
    );
    assert_eq!(rf.data.key, "cards");
    assert_eq!(rf.gap, Some(Length::Percent(5.0)));
    assert_eq!(rf.item.items.len(), 1);
    assert!(rf.id.is_none());
}

#[test]
fn minimal_repeat_flow_round_trips_without_injected_defaults() {
    let tpl = parse_template(&rf_yaml(
        r#"        data: { key: cards }
        item:
          items: []
"#,
    ))
    .expect("template");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    // Serialize the repeat_flow node alone: unset keys stay unset (the
    // template-level serialization still injects pre-existing defaults
    // elsewhere, which is a known asymmetry rather than a rule).
    let yaml = serde_yaml::to_string(&flow.items[0]).expect("yaml");
    assert!(!yaml.contains("gap"), "injected gap: {yaml}");
    assert!(!yaml.contains("\nid:"), "injected id: {yaml}");
    // And the round-trip parses back to the same shape.
    let again = parse_template(&serde_yaml::to_string(&tpl).expect("yaml")).expect("reparse");
    let Body::Flow(flow) = &again.sections.body else { panic!("expected flow") };
    assert!(matches!(&flow.items[0], Item::RepeatFlow(rf) if rf.gap.is_none() && rf.id.is_none()));
}

#[test]
fn repeat_flow_unknown_key_is_a_parse_error() {
    let err = parse_template(&rf_yaml(
        r#"        data: { key: cards }
        cell:
          items: []
        item:
          items: []
"#,
    ))
    .expect_err("unknown field");
    assert!(err.to_string().contains("unknown field"), "got: {err}");
}

#[test]
fn repeat_flow_requires_data_and_item() {
    let no_data =
        parse_template(&rf_yaml("        item:\n          items: []\n")).expect_err("missing data");
    assert!(no_data.to_string().contains("data"), "got: {no_data}");
    let no_item =
        parse_template(&rf_yaml("        data: { key: cards }\n")).expect_err("missing item");
    assert!(no_item.to_string().contains("item"), "got: {no_item}");
}

#[test]
fn repeat_flow_id_is_exposed_via_item_id() {
    let tpl = parse_template(&rf_yaml(
        r#"        id: cardList
        data: { key: cards }
        item:
          items: []
"#,
    ))
    .expect("template");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    assert_eq!(flow.items[0].id(), Some("cardList"));
}
