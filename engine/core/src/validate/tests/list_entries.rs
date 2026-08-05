//! A `list`'s per-entry keys: they resolve against ONE ELEMENT of the
//! bound array, at document scope and inside a `repeat` cell alike, so a
//! typo in the entry template is a validate finding rather than a layout
//! `missing_data` nobody sees until the page is drawn.

mod sources;

use super::*;

fn ldefs() -> Definitions {
    parse_definitions(
        r#"
type: object
properties:
  venue:
    type: string
  releases:
    type: array
    items:
      type: object
      properties:
        name:
          type: string
        shop:
          type: string
  tags:
    type: array
    items:
      type: string
  bare:
    type: array
  orders:
    type: array
    items:
      type: object
      properties:
        code:
          type: string
        items:
          type: array
          items:
            type: object
            properties:
              title:
                type: string
"#,
    )
    .expect("defs")
}

fn codes(diags: &Diagnostics, code: &str) -> Vec<String> {
    diags
        .iter()
        .filter(|d| d.code == code)
        .map(|d| d.message.clone())
        .collect()
}

/// A document-scope list over `key` with the given `text:` template.
fn list_over(key: &str, text: &str) -> Template {
    tpl(&format!(
        "      - type: list\n        data: {{ key: {key} }}\n        text: \"{text}\"\n"
    ))
}

/// A `repeat` over `orders` whose cell carries a list bound to the row's
/// own `items` array.
fn nested_list(text: &str) -> Template {
    tpl(&format!(
        "      - type: repeat\n        data: {{ key: orders }}\n        cell:\n          items:\n            - type: list\n              data: {{ key: items }}\n              text: \"{text}\"\n"
    ))
}

#[test]
fn an_unknown_entry_key_is_reported_against_the_element() {
    let t = list_over("releases", "{nmae}");
    let diags = validate(Some(&ldefs()), &t, None);
    let d = diags
        .iter()
        .find(|d| d.code == "unknown_data_key")
        .expect("unknown entry key");
    assert!(d.message.contains("nmae"));
    assert!(d.message.contains("releases"));
    assert_eq!(d.path.as_deref(), Some("sections.body.items[0]"));
}

#[test]
fn a_declared_entry_key_passes() {
    let t = list_over("releases", "{name} @ {shop}");
    let diags = validate(Some(&ldefs()), &t, None);
    assert!(codes(&diags, "unknown_data_key").is_empty());
}

#[test]
fn a_nested_lists_entry_key_is_checked_against_the_nested_element() {
    let good = validate(Some(&ldefs()), &nested_list("{title}"), None);
    assert!(
        codes(&good, "unknown_data_key").is_empty(),
        "a declared nested element field should pass: {:?}",
        codes(&good, "unknown_data_key")
    );

    let bad = validate(Some(&ldefs()), &nested_list("{tilte}"), None);
    let d = bad
        .iter()
        .find(|d| d.code == "unknown_data_key")
        .expect("unknown nested entry key");
    assert!(d.message.contains("tilte"));
    // Named by the source it was checked against: the NESTED array.
    assert!(d.message.contains("orders.items"), "{}", d.message);
}

#[test]
fn a_row_field_of_the_enclosing_cell_is_not_an_entry_field() {
    // `code` is a field of the ORDER, not of one of its items: inside the
    // list's entry template it is out of scope, and saying so is the
    // whole point of resolving one level further in.
    let diags = validate(Some(&ldefs()), &nested_list("{code}"), None);
    let d = diags
        .iter()
        .find(|d| d.code == "unknown_data_key")
        .expect("a cell-scope key used in entry scope");
    assert!(d.message.contains("code"));
}

#[test]
fn a_scalar_element_has_no_fields_at_all() {
    let t = list_over("tags", "{name}");
    let diags = validate(Some(&ldefs()), &t, None);
    let d = diags
        .iter()
        .find(|d| d.code == "unknown_data_key")
        .expect("a scalar entry carries no fields");
    assert!(d.message.contains("name"));
}

#[test]
fn an_undeclared_element_claims_nothing() {
    let t = list_over("bare", "{whatever}");
    let diags = validate(Some(&ldefs()), &t, None);
    assert!(
        codes(&diags, "unknown_data_key").is_empty(),
        "an array with no `items:` declares no shape to check against"
    );
}

#[test]
fn an_undeclared_array_source_claims_nothing_about_its_entries() {
    let t = list_over("nope", "{whatever}");
    let diags = validate(Some(&ldefs()), &t, None);
    // The SOURCE key is layout's check (`missing_data`/`not_an_array`);
    // what must not happen is a fabricated finding about its entries.
    assert!(!diags.iter().any(|d| d.message.contains("whatever")));
}

#[test]
fn without_definitions_nothing_is_claimed() {
    for t in [list_over("releases", "{nmae}"), nested_list("{tilte}")] {
        let diags = validate(None, &t, None);
        assert!(
            codes(&diags, "unknown_data_key").is_empty(),
            "no catalog means no declared shape to check against"
        );
    }
}

#[test]
fn a_declaration_the_entry_template_uses_is_checked_in_its_own_scope() {
    // `shop: { key: nope }` reads the ELEMENT (the default scope), so its
    // key is checked against the element — while a `scope: document`
    // declaration escapes to the top-level scalars and is checked there.
    let t = tpl(
        "      - type: list\n        data: { key: releases }\n        text: \"{a} {b}\"\n        bindings:\n          a: { key: nope }\n          b: { key: venue, scope: document }\n",
    );
    let diags = validate(Some(&ldefs()), &t, None);
    let unknown = codes(&diags, "unknown_data_key");
    assert_eq!(unknown.len(), 1, "{unknown:?}");
    assert!(unknown[0].contains("nope"));
    assert!(unknown[0].contains("releases"));
}

#[test]
fn an_element_scoped_declaration_is_reported_once_at_its_own_path() {
    let t = tpl(
        "      - type: list\n        data: { key: releases }\n        text: \"{a}\"\n        bindings:\n          a: { key: nope }\n",
    );
    let diags = validate(Some(&ldefs()), &t, None);
    let paths: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "unknown_data_key")
        .map(|d| d.path.clone())
        .collect();
    assert_eq!(
        paths,
        vec![Some("sections.body.items[0].bindings.a".to_string())]
    );
}

#[test]
fn a_document_scoped_list_inside_a_cell_reads_the_top_level_array() {
    // `scope: document` escapes the cell, so the entries are the TOP-LEVEL
    // array's — `name` resolves, and the row's own `items` shape does not
    // apply.
    let t = tpl(
        "      - type: repeat\n        data: { key: orders }\n        cell:\n          items:\n            - type: list\n              data: { key: releases, scope: document }\n              text: \"{name}\"\n",
    );
    let diags = validate(Some(&ldefs()), &t, None);
    assert!(
        codes(&diags, "unknown_data_key").is_empty(),
        "{:?}",
        codes(&diags, "unknown_data_key")
    );
}

#[test]
fn a_hostile_entry_key_comes_back_bounded_and_sanitized() {
    // Positive control first: the key must actually REACH the message, or
    // the bounding assertions below prove nothing.
    let marker = "MARKERKEY";
    let t = list_over("releases", &format!("{{{marker}}}"));
    let diags = validate(Some(&ldefs()), &t, None);
    let d = diags
        .iter()
        .find(|d| d.code == "unknown_data_key")
        .expect("the key reaches the diagnostic");
    assert!(d.message.contains(marker), "{}", d.message);

    // The GROUP name is document-declared too, and it is composed into an
    // arg — so it is bounded there rather than echoed whole.
    let long = "g".repeat(400);
    let defs = parse_definitions(&format!(
        "type: object\nproperties:\n  {long}:\n    type: array\n    items:\n      type: object\n      properties:\n        name:\n          type: string\n"
    ))
    .expect("defs");
    let t = list_over(&long, &format!("{{{marker}}}"));
    let diags = validate(Some(&defs), &t, None);
    let d = diags
        .iter()
        .find(|d| d.code == "unknown_data_key")
        .expect("the entry key is still reported");
    assert!(d.message.contains(marker));
    assert!(
        d.message.chars().count() < 400,
        "the composed group name must not crowd the message out: {}",
        d.message.chars().count()
    );
}
