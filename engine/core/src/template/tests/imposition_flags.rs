//! Wire tests for the imposition small-flag set: the grid's `gap`
//! shorthand, `cutMarks`, and the binding `scope:` escape — parse,
//! defaults, unset-never-serializes, and typo rejection.

use super::*;
use crate::template::BindingScope;

fn repeat_of(spec: &str) -> RepeatItem {
    let yaml = format!(
        r#"
page: {{ size: A4 }}
sections:
  body:
    type: flow
    items:
      - type: repeat
        data: {{ key: receipts }}
        {spec}
        cell:
          items:
            - type: text
              data: {{ key: code }}
"#
    );
    let tpl = parse_template(&yaml).expect("parse");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    let Item::Repeat(rep) = &flow.items[0] else { panic!("expected repeat") };
    rep.clone()
}

#[test]
fn the_gap_shorthand_feeds_both_axes() {
    let rep = repeat_of("grid: { columns: 2, rows: 2, gap: 12 }");
    assert_eq!(rep.grid.column_gap(), Some(Length::Pt(12.0)));
    assert_eq!(rep.grid.row_gap(), Some(Length::Pt(12.0)));
}

#[test]
fn an_axis_key_wins_over_the_shorthand() {
    let rep = repeat_of("grid: { columns: 2, rows: 2, gap: 12, rowGap: \"4%\" }");
    assert_eq!(rep.grid.column_gap(), Some(Length::Pt(12.0)));
    assert_eq!(rep.grid.row_gap(), Some(Length::Percent(4.0)));
}

#[test]
fn a_bare_grid_still_serializes_as_absent() {
    let rep = repeat_of("grid: { columns: 2 }");
    assert!(rep.grid.column_gap().is_none() && rep.grid.row_gap().is_none());
    let out = serde_yaml::to_string(&rep).expect("yaml");
    assert!(!out.contains("gap"), "{out}");
    assert!(!out.contains("cutMarks"), "{out}");
}

#[test]
fn an_unauthored_grid_never_serializes_at_all() {
    // `GridSpec::is_default` still gates the whole key, so adding `gap`
    // did not start injecting a `grid:` into every repeat.
    let rep = repeat_of("breakBefore: auto");
    let out = serde_yaml::to_string(&rep).expect("yaml");
    assert!(!out.contains("grid"), "{out}");
}

#[test]
fn cut_marks_default_to_off_and_round_trip() {
    assert!(!repeat_of("grid: { columns: 2 }").cut_marks());
    let rep = repeat_of("cutMarks: true\n        grid: { columns: 2 }");
    assert!(rep.cut_marks());
    let out = serde_yaml::to_string(&rep).expect("yaml");
    assert!(out.contains("cutMarks: true"), "{out}");
}

#[test]
fn an_unknown_grid_key_is_a_parse_error() {
    let yaml = r#"
page: { size: A4 }
sections:
  body:
    type: flow
    items:
      - type: repeat
        data: { key: receipts }
        grid: { columns: 2, gutter: 10 }
        cell: { items: [] }
"#;
    assert!(parse_template(yaml).is_err());
}

#[test]
fn a_binding_scope_parses_and_defaults_to_element() {
    let yaml = r#"
page: { size: A4 }
sections:
  body:
    type: flow
    items:
      - type: text
        data: { key: store, scope: document }
      - type: text
        data: { key: code }
"#;
    let tpl = parse_template(yaml).expect("parse");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    let Item::Text(escaped) = &flow.items[0] else { panic!("text") };
    let Item::Text(plain) = &flow.items[1] else { panic!("text") };
    assert_eq!(
        escaped.data.as_ref().map(|b| b.scope()),
        Some(BindingScope::Document)
    );
    assert_eq!(
        plain.data.as_ref().map(|b| b.scope()),
        Some(BindingScope::Element)
    );
    // Unset never serializes; the authored escape round-trips.
    let out = serde_yaml::to_string(&tpl).expect("yaml");
    assert_eq!(out.matches("scope:").count(), 1, "{out}");
    assert!(out.contains("scope: document"), "{out}");
    parse_template(&out).expect("reparse");
}

#[test]
fn an_unknown_scope_value_is_a_parse_error() {
    let yaml = r#"
page: { size: A4 }
sections:
  body:
    type: flow
    items:
      - type: text
        data: { key: store, scope: page }
"#;
    assert!(parse_template(yaml).is_err());
}

#[test]
fn a_form_mark_binding_takes_the_same_scope_key() {
    let yaml = r#"
page: { size: A4 }
sections:
  body:
    type: flow
    items:
      - type: checkbox
        box: { w: 10, h: 10 }
        data: { key: paid, scope: document }
"#;
    let tpl = parse_template(yaml).expect("parse");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    let Item::Checkbox(check) = &flow.items[0] else { panic!("checkbox") };
    assert_eq!(
        check.data.as_ref().map(|b| b.scope()),
        Some(BindingScope::Document)
    );
}
