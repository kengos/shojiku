//! Validation of text-item `ruby` readings: empty entries and the
//! entries cap.

use super::*;

#[test]
fn empty_base_or_text_warns_per_entry() {
    let template = tpl(r#"
      - type: text
        text: 吾輩は猫
        ruby:
          - { base: "", text: よみ }
          - { base: 猫, text: "" }
          - { base: 猫, text: ねこ }
"#);
    let diags = validate(None, &template, None);
    let empties: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "empty_ruby_entry")
        .collect();
    assert_eq!(empties.len(), 2);
    assert!(empties[0]
        .path
        .as_deref()
        .is_some_and(|p| p.ends_with(".ruby[0]")));
}

#[test]
fn entries_at_the_cap_pass_and_past_it_warn() {
    let entry = "          - { base: 猫, text: ねこ }\n";
    let at_cap = format!(
        "      - type: text\n        text: 猫\n        ruby:\n{}",
        entry.repeat(crate::template::MAX_RUBY_ENTRIES)
    );
    let diags = validate(None, &tpl(&at_cap), None);
    assert!(diags.iter().all(|d| d.code != "too_many_ruby_entries"));

    let over = format!(
        "      - type: text\n        text: 猫\n        ruby:\n{}",
        entry.repeat(crate::template::MAX_RUBY_ENTRIES + 1)
    );
    let diags = validate(None, &tpl(&over), None);
    assert!(diags.iter().any(|d| d.code == "too_many_ruby_entries"));
}

#[test]
fn an_over_long_base_or_text_warns_and_at_the_cap_passes() {
    let at_cap = "猫".repeat(crate::ruby::MAX_RUBY_LEN);
    let tpl_at = tpl(&format!(
        "      - type: text\n        text: 吾輩\n        ruby:\n          - {{ base: \"{at_cap}\", text: ね }}\n"
    ));
    let diags = validate(None, &tpl_at, None);
    assert!(
        diags.iter().all(|d| d.code != "ruby_entry_too_long"),
        "a base AT the cap passes"
    );

    let over = "猫".repeat(crate::ruby::MAX_RUBY_LEN + 1);
    let tpl_base = tpl(&format!(
        "      - type: text\n        text: 吾輩\n        ruby:\n          - {{ base: \"{over}\", text: ね }}\n"
    ));
    let diags = validate(None, &tpl_base, None);
    assert!(diags.iter().any(|d| d.code == "ruby_entry_too_long"));

    let tpl_text = tpl(&format!(
        "      - type: text\n        text: 吾輩\n        ruby:\n          - {{ base: 吾, text: \"{over}\" }}\n"
    ));
    let diags = validate(None, &tpl_text, None);
    assert!(diags.iter().any(|d| d.code == "ruby_entry_too_long"));
}
