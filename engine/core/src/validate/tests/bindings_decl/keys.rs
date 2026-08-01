//! Where a declaration's `key` is checked: top-level scalars at document
//! scope, the bound array group inside a cell, and top-level again when
//! the declaration escapes with `scope: document`.

use super::*;

#[test]
fn an_unknown_declaration_key_is_reported_at_the_declaration() {
    let template = tpl(r#"      - type: text
        text: "{n}"
        bindings:
          n: { key: ghost }
"#);
    let diags = validate(Some(&jdefs()), &template, None);
    let found = find(&diags, "unknown_data_key");
    assert_eq!(found.len(), 1, "{diags:?}");
    assert_eq!(
        found[0].path.as_deref(),
        Some("sections.body.items[0].bindings.n")
    );
    assert!(found[0].message.contains("ghost"), "{diags:?}");
}

#[test]
fn a_cell_declaration_checks_the_array_group_by_default() {
    let template = in_cell(
        r#"            - type: text
              text: "{n}"
              bindings:
                n: { key: ghost }"#,
    );
    let diags = validate(Some(&jdefs()), &template, None);
    let found = find(&diags, "unknown_data_key");
    assert_eq!(found.len(), 1, "{diags:?}");
    // Reported against the group, not definitions.
    assert!(found[0].message.contains("rows"), "{diags:?}");
    // A real field of the group passes.
    let ok = in_cell(
        r#"            - type: text
              text: "{n}"
              bindings:
                n: { key: name }"#,
    );
    let diags = validate(Some(&jdefs()), &ok, None);
    assert!(find(&diags, "unknown_data_key").is_empty(), "{diags:?}");
}

#[test]
fn a_cell_declaration_with_the_document_escape_checks_top_level() {
    // `store` is a top-level scalar, NOT a field of `rows`: only the
    // escape makes it resolvable from inside the cell.
    let template = in_cell(
        r#"            - type: text
              text: "{shop}"
              bindings:
                shop: { key: store, scope: document }"#,
    );
    let diags = validate(Some(&jdefs()), &template, None);
    assert!(find(&diags, "unknown_data_key").is_empty(), "{diags:?}");
    // …and an escape to a key that is only a GROUP field is still caught.
    let bad = in_cell(
        r#"            - type: text
              text: "{n}"
              bindings:
                n: { key: name, scope: document }"#,
    );
    let diags = validate(Some(&jdefs()), &bad, None);
    let found = find(&diags, "unknown_data_key");
    assert_eq!(found.len(), 1, "{diags:?}");
    assert!(found[0].message.contains("definitions"), "{diags:?}");
}

#[test]
fn an_unknown_declaration_format_is_reported() {
    let template = tpl(r#"      - type: text
        text: "{n}"
        bindings:
          n: { key: total, format: ghostfmt }
"#);
    let diags = validate(Some(&jdefs()), &template, None);
    let found = find(&diags, "unknown_format");
    assert_eq!(found.len(), 1, "{diags:?}");
    assert_eq!(
        found[0].path.as_deref(),
        Some("sections.body.items[0].bindings.n")
    );
}

#[test]
fn a_used_declared_name_is_not_also_checked_as_a_raw_key() {
    // `n` is not a data key at all; without the skip the reference would
    // report `unknown_data_key` for `n` on top of the declaration's own.
    let template = tpl(r#"      - type: text
        text: "{n}"
        bindings:
          n: { key: ghost }
"#);
    let diags = validate(Some(&jdefs()), &template, None);
    let found = find(&diags, "unknown_data_key");
    assert_eq!(found.len(), 1, "{diags:?}");
    assert!(!found[0].message.contains("`n`"), "{diags:?}");
}

#[test]
fn an_undeclared_name_on_the_same_line_is_still_checked_as_a_raw_key() {
    // The mixed line the feature exists for: one name declared, the rest
    // untouched. Each is checked in its own place — the declaration at
    // the declaration's path, the bare name at the item's.
    let template = in_cell(
        r#"            - type: text
              text: "{shop} / {ghost}"
              bindings:
                shop: { key: store, scope: document }"#,
    );
    let diags = validate(Some(&jdefs()), &template, None);
    let found = find(&diags, "unknown_data_key");
    assert_eq!(found.len(), 1, "{diags:?}");
    assert!(found[0].message.contains("ghost"), "{diags:?}");
    // Reported against the array group at the ITEM path — the bare name
    // never became a declaration.
    assert!(found[0].message.contains("rows"), "{diags:?}");
    assert_eq!(
        found[0].path.as_deref(),
        Some("sections.body.items[0].cell.items[0]")
    );
}

#[test]
fn an_undeclared_name_keeps_its_own_inline_format_check() {
    // Same mixed line, but the UNDECLARED name carries a `:format` too.
    // It must be checked as a raw key at the ITEM path — the declaration
    // map is not consulted for it, at either half of the check.
    let template = tpl(r#"      - type: text
        text: "{n} / {total:ghostfmt}"
        bindings:
          n: { key: store }
"#);
    let diags = validate(Some(&jdefs()), &template, None);
    let found = find(&diags, "unknown_format");
    assert_eq!(found.len(), 1, "{diags:?}");
    assert!(found[0].message.contains("ghostfmt"), "{diags:?}");
    assert!(found[0].message.contains("total"), "{diags:?}");
    // Reported where the reference is, not at any declaration.
    assert_eq!(found[0].path.as_deref(), Some("sections.body.items[0]"));
}

#[test]
fn an_inline_format_override_is_checked_against_the_declared_key() {
    let template = tpl(r#"      - type: text
        text: "{n:ghostfmt}"
        bindings:
          n: { key: total }
"#);
    let diags = validate(Some(&jdefs()), &template, None);
    let found = find(&diags, "unknown_format");
    assert_eq!(found.len(), 1, "{diags:?}");
    // Named for the DECLARATION's key, not for the reference name.
    assert!(found[0].message.contains("total"), "{diags:?}");
    assert!(found[0].message.contains("ghostfmt"), "{diags:?}");
    // A variant the field really declares passes.
    let ok = tpl(r#"      - type: text
        text: "{n:default}"
        bindings:
          n: { key: total }
"#);
    let diags = validate(Some(&jdefs()), &ok, None);
    assert!(find(&diags, "unknown_format").is_empty(), "{diags:?}");
}

#[test]
fn a_declaration_placeholder_suppresses_missing_data() {
    let params = json!({ "store": "s" });
    let bare = tpl(r#"      - type: text
        text: "{n}"
        bindings:
          n: { key: total }
"#);
    let diags = validate(Some(&jdefs()), &bare, Some(&params));
    assert_eq!(find(&diags, "missing_data").len(), 1, "{diags:?}");
    let covered = tpl(r#"      - type: text
        text: "{n}"
        bindings:
          n: { key: total, placeholder: "—" }
"#);
    let diags = validate(Some(&jdefs()), &covered, Some(&params));
    assert!(find(&diags, "missing_data").is_empty(), "{diags:?}");
}
