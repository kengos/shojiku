//! The charset scan: a `{…}` that looks like an intended key but cannot
//! parse prints its braces on the page, and that was silent until now.

use super::*;

#[test]
fn an_undeclared_non_ascii_key_is_reported() {
    let template = tpl("      - type: text\n        text: \"和文キー {品名} です\"\n");
    let diags = validate(Some(&jdefs()), &template, None);
    let found = find(&diags, "interpolation_key_charset");
    assert_eq!(found.len(), 1, "{diags:?}");
    assert_eq!(found[0].path.as_deref(), Some("sections.body.items[0]"));
    assert!(found[0].message.contains("{品名}"), "{diags:?}");
}

#[test]
fn yaml_snippets_and_escaped_braces_are_left_alone() {
    // A code sample in a showcase panel: whitespace disqualifies it, and
    // `{{` is the documented escape for a literal brace.
    let template = tpl(concat!(
        "      - type: text\n",
        "        text: \"box: { h: 24 } / style: { textAlign: center }\"\n",
    ));
    let diags = validate(Some(&jdefs()), &template, None);
    assert!(
        find(&diags, "interpolation_key_charset").is_empty(),
        "{diags:?}"
    );
    let escaped = tpl("      - type: text\n        text: \"{{品名}}\"\n");
    let diags = validate(Some(&jdefs()), &escaped, None);
    assert!(
        find(&diags, "interpolation_key_charset").is_empty(),
        "{diags:?}"
    );
}

#[test]
fn the_scan_reaches_inside_a_cell() {
    let template = in_cell(
        r#"            - type: text
              text: "{品名}""#,
    );
    let diags = validate(Some(&jdefs()), &template, None);
    let found = find(&diags, "interpolation_key_charset");
    assert_eq!(found.len(), 1, "{diags:?}");
}

#[test]
fn the_structural_checks_reach_cell_contents_without_definitions() {
    // The cell BINDING walk only runs when definitions declare the bound
    // array, so anything riding it goes silent for a template validated
    // without them — which is most hand-authored ones. The charset scan,
    // the unreferenceable name and the unused declaration must not.
    let template = in_cell(
        r#"            - type: text
              text: "{品名}"
              bindings:
                品名: { key: x }
                never_used: { key: y }"#,
    );
    let diags = validate(None, &template, None);
    assert_eq!(
        find(&diags, "interpolation_key_charset").len(),
        1,
        "{diags:?}"
    );
    assert_eq!(find(&diags, "invalid_binding_name").len(), 1, "{diags:?}");
    let unused = find(&diags, "unused_binding");
    assert_eq!(unused.len(), 1, "{diags:?}");
    assert_eq!(
        unused[0].path.as_deref(),
        Some("sections.body.items[0].cell.items[0].bindings.never_used")
    );
    // A table `cell:` column is reached the same way.
    let table = tpl(concat!(
        "      - type: table\n",
        "        data: { key: rows }\n",
        "        columns:\n",
        "          - cell:\n",
        "              items:\n",
        "                - type: text\n",
        "                  text: \"{品名}\"\n",
    ));
    let diags = validate(None, &table, None);
    let found = find(&diags, "interpolation_key_charset");
    assert_eq!(found.len(), 1, "{diags:?}");
    assert_eq!(
        found[0].path.as_deref(),
        Some("sections.body.items[0].columns[0].cell.items[0]")
    );
}

#[test]
fn declaring_a_name_is_the_fix_and_clears_the_warning() {
    let template = tpl(r#"      - type: text
        text: "和文キー {hinmei} です"
        bindings:
          hinmei: { key: 品名 }
"#);
    let diags = validate(Some(&jdefs()), &template, None);
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
}
