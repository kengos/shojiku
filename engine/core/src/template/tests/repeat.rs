//! Parsing and round-trip serialization of the `repeat` wire's
//! `breakBefore` key: the two grid-start behaviors, the unset default, and
//! deny-unknown-value typo safety.

use super::super::*;
use crate::error::CoreError;

fn repeat_yaml(body: &str) -> String {
    format!(
        "sections:\n  body:\n    type: flow\n    box: {{ x: 0, y: 0, w: 500, h: 700 }}\n    items:\n      - type: repeat\n        data: {{ key: tickets }}\n{body}        cell:\n          items:\n            - type: text\n              data: {{ key: code }}\n"
    )
}

fn parse_repeat(body: &str) -> RepeatItem {
    let tpl = parse_template(&repeat_yaml(body)).expect("template");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    let Item::Repeat(repeat) = &flow.items[0] else { panic!("expected repeat") };
    repeat.clone()
}

#[test]
fn break_before_auto_starts_the_grid_at_the_cursor() {
    let repeat = parse_repeat("        breakBefore: auto\n");
    assert_eq!(repeat.break_before(), BreakBefore::Auto);
}

#[test]
fn break_before_page_is_authorable_explicitly() {
    let repeat = parse_repeat("        breakBefore: page\n");
    assert_eq!(repeat.break_before(), BreakBefore::Page);
}

#[test]
fn an_unset_break_before_defaults_to_a_fresh_page() {
    let repeat = parse_repeat("");
    assert_eq!(repeat.break_before(), BreakBefore::Page);
}

#[test]
fn an_unknown_break_before_value_is_a_located_parse_error() {
    let err =
        parse_template(&repeat_yaml("        breakBefore: sideways\n")).expect_err("must reject");
    let CoreError::Located { path, message, .. } = &err else { panic!("{err:?}") };
    assert!(path.starts_with("sections.body"), "path: {path}");
    // The message names the bad value and the variants that would work.
    assert!(message.contains("sideways"), "message: {message}");
    assert!(message.contains("auto"), "message: {message}");
    assert!(message.contains("page"), "message: {message}");
}

#[test]
fn an_unset_break_before_never_serializes() {
    let repeat = parse_repeat("");
    // Serialize the repeat node alone: the template level still injects
    // defaults from older wire structs, which would mask this check.
    let yaml = serde_yaml::to_string(&repeat).expect("serialize");
    assert!(!yaml.contains("breakBefore"), "yaml: {yaml}");
}

#[test]
fn an_authored_break_before_round_trips_in_its_authored_form() {
    let repeat = parse_repeat("        breakBefore: auto\n");
    let yaml = serde_yaml::to_string(&repeat).expect("serialize");
    assert!(yaml.contains("breakBefore: auto"), "yaml: {yaml}");
}
