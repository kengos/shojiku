//! Parsing and round-trip serialization of text-item `ruby` readings.

use super::super::*;

#[test]
fn ruby_pairs_parse_with_ruby_size() {
    let tpl = parse_template(
        r#"
sections:
  body:
    type: flow
    items:
      - type: text
        text: 吾輩は猫である
        rubySize: 6
        ruby:
          - { base: 吾輩, text: わがはい }
          - { base: 猫, text: ねこ }
        style: { writingMode: vertical_rl }
"#,
    )
    .expect("template");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    let Item::Text(text) = &flow.items[0] else { panic!("expected text") };
    assert_eq!(text.ruby.len(), 2);
    assert_eq!(text.ruby[0].base, "吾輩");
    assert_eq!(text.ruby[0].text, "わがはい");
    assert!(text.ruby_size.is_some());
}

#[test]
fn ruby_pair_rejects_unknown_keys() {
    let err = parse_template(
        r#"
sections:
  body:
    type: flow
    items:
      - type: text
        text: 吾輩
        ruby:
          - { base: 吾輩, text: わがはい, hover: x }
"#,
    );
    assert!(err.is_err(), "unknown ruby-pair key must be a parse error");
}

#[test]
fn unset_ruby_keys_do_not_serialize() {
    let tpl = parse_template(
        "sections:\n  body:\n    type: flow\n    items:\n      - type: text\n        text: a\n",
    )
    .expect("template");
    let Body::Flow(flow) = &tpl.sections.body else { panic!("expected flow") };
    // Serialize the ITEM node alone (older wire structs inject defaults
    // at the template level).
    let yaml = serde_yaml::to_string(&flow.items[0]).expect("yaml");
    assert!(!yaml.contains("ruby"), "got: {yaml}");
    assert!(!yaml.contains("rubySize"), "got: {yaml}");
}
