//! Re-locating a template parse failure to the item that raised it, driven
//! through `parse_template`: every item holder, the key-or-no-key split, the
//! cases that must keep serde's own error, and the hostile shapes.

use crate::error::CoreError;
use crate::template::parse_template;

/// A line carrying a key its struct rejects — the shape the Designer's
/// named-style picker used to author.
const BAD_LINE: &str =
    "{ type: line, from: { x: 0, y: 0 }, to: { x: 9, y: 0 }, styleNames: [ a ] }";
const GOOD_TEXT: &str = "{ type: text, text: ok }";

/// The located error's `(path, key, line, column)`.
fn fault(yaml: &str) -> (String, Option<String>, usize, usize) {
    let err = parse_template(yaml).expect_err("must reject");
    let CoreError::Located {
        path,
        key,
        line,
        column,
        ..
    } = err
    else {
        panic!("{err:?}")
    };
    (
        path.as_str().to_owned(),
        key.map(|k| k.as_str().to_owned()),
        line,
        column,
    )
}

fn flow(items: &str) -> String {
    format!("sections:\n  body:\n    type: flow\n    items: [ {items} ]\n")
}

#[test]
fn an_unknown_key_on_a_body_item_names_the_item_and_the_key() {
    let (path, key, line, column) = fault(&flow(&format!("{GOOD_TEXT}, {BAD_LINE}")));
    assert_eq!(path, "sections.body.items[1]");
    assert_eq!(key.as_deref(), Some("styleNames"));
    // The location serde gave points at the enclosing body, so it is dropped.
    assert_eq!((line, column), (0, 0));
}

#[test]
fn an_absolute_body_item_is_located() {
    let yaml = format!("sections:\n  body:\n    type: absolute\n    items: [ {BAD_LINE} ]\n");
    assert_eq!(fault(&yaml).0, "sections.body.items[0]");
}

#[test]
fn a_header_and_a_footer_band_item_are_located() {
    for band in ["header", "footer"] {
        let yaml = format!(
            "sections:\n  {band}:\n    items: [ {GOOD_TEXT}, {BAD_LINE} ]\n  body:\n    type: flow\n    items: []\n"
        );
        let (path, key, ..) = fault(&yaml);
        assert_eq!(path, format!("sections.{band}.items[1]"));
        assert_eq!(key.as_deref(), Some("styleNames"));
    }
}

#[test]
fn a_nested_container_item_is_located_to_the_deepest_item() {
    let inner = format!("{{ type: container, items: [ {GOOD_TEXT}, {BAD_LINE} ] }}");
    let outer = format!("{{ type: container, items: [ {inner} ] }}");
    let (path, key, ..) = fault(&flow(&format!("{GOOD_TEXT}, {outer}")));
    assert_eq!(path, "sections.body.items[1].items[0].items[1]");
    assert_eq!(key.as_deref(), Some("styleNames"));
}

#[test]
fn a_repeat_cell_item_is_located() {
    let item =
        format!("{{ type: repeat, data: {{ key: rows }}, cell: {{ items: [ {BAD_LINE} ] }} }}");
    assert_eq!(
        fault(&flow(&item)).0,
        "sections.body.items[0].cell.items[0]"
    );
}

#[test]
fn a_repeat_flow_item_is_located() {
    let item = format!(
        "{{ type: repeat_flow, data: {{ key: rows }}, item: {{ items: [ {BAD_LINE} ] }} }}"
    );
    assert_eq!(
        fault(&flow(&item)).0,
        "sections.body.items[0].item.items[0]"
    );
}

#[test]
fn a_table_column_cell_item_is_located() {
    let item = format!(
        "{{ type: table, data: {{ key: rows }}, columns: [ {{ label: a, cell: {{ items: [ {BAD_LINE} ] }} }} ] }}"
    );
    assert_eq!(
        fault(&flow(&item)).0,
        "sections.body.items[0].columns[0].cell.items[0]"
    );
}

#[test]
fn a_nested_unknown_key_names_the_item_but_no_key() {
    // `fontSizee` is unknown on the item's STYLE, not on the item: removing a
    // top-level key would not fix it, so none is offered.
    let (path, key, ..) = fault(&flow("{ type: text, text: a, style: { fontSizee: 3 } }"));
    assert_eq!(path, "sections.body.items[0]");
    assert_eq!(key, None);
}

#[test]
fn a_wrong_type_or_an_unknown_item_type_names_the_item_but_no_key() {
    for item in ["{ type: text, text: [ 1 ] }", "{ type: txt, text: a }"] {
        let (path, key, ..) = fault(&flow(&format!("{GOOD_TEXT}, {item}")));
        assert_eq!(path, "sections.body.items[1]", "{item}");
        assert_eq!(key, None, "{item}");
    }
}

#[test]
fn a_scalar_in_an_item_list_is_located_with_no_key() {
    let (path, key, ..) = fault(&flow(&format!("{GOOD_TEXT}, 5")));
    assert_eq!(path, "sections.body.items[1]");
    assert_eq!(key, None);
}

#[test]
fn the_first_failing_item_in_document_order_is_the_one_reported() {
    let second = "{ type: rect, box: { w: 1, h: 1 }, bogus: 1 }";
    let (path, key, ..) = fault(&flow(&format!("{BAD_LINE}, {second}")));
    assert_eq!(path, "sections.body.items[0]");
    assert_eq!(key.as_deref(), Some("styleNames"));
}

#[test]
fn a_failure_outside_any_item_keeps_serdes_own_error() {
    // The top-level typo is serde's first failure; the bad item after it must
    // not steal the report.
    let yaml = format!("bogusTop: 1\n{}", flow(BAD_LINE));
    let (path, key, line, _) = fault(&yaml);
    assert_eq!(path, "bogusTop");
    assert_eq!(key, None);
    assert_eq!(line, 1);
}

#[test]
fn a_body_field_failure_is_not_blamed_on_a_bad_item() {
    // `gap` fails on the flow body itself, ahead of its items.
    let yaml =
        format!("sections:\n  body:\n    type: flow\n    gap: [ 1 ]\n    items: [ {BAD_LINE} ]\n");
    let (path, key, ..) = fault(&yaml);
    assert_eq!(path, "sections.body");
    assert_eq!(key, None);
}

#[test]
fn a_valid_key_that_prefixes_the_unknown_one_is_never_named() {
    // serde quotes the bad key as ``unknown field `text`x`, …``, which also
    // contains ``unknown field `text``` — naming `text` would have the quick-fix
    // delete the item's real content.
    let (path, key, ..) = fault(&flow("{ type: text, text: keep, \"text`x\": 1 }"));
    assert_eq!(path, "sections.body.items[0]");
    assert_eq!(key.as_deref(), Some("text`x"));
}

#[test]
fn a_nested_key_that_shares_a_name_with_one_of_the_items_own_is_never_named() {
    // Each inner struct rejects a field spelled like a REAL key of the item;
    // the message cannot say at what depth, and naming the item's key would
    // have the quick-fix delete content while the document still fails.
    for item in [
        "{ type: text, text: a, style: { fontSize: 3 }, box: { style: 1 } }",
        "{ type: text, box: { w: 1 }, spans: [ { text: a, box: {} } ] }",
        "{ type: text, text: a, data: { text: x } }",
    ] {
        let (path, key, ..) = fault(&flow(item));
        assert_eq!(path, "sections.body.items[0]", "{item}");
        assert_eq!(key, None, "{item}");
    }
}

#[test]
fn a_key_carrying_serdes_own_quoting_is_named_and_the_valid_one_is_not() {
    // ``text`, x`` contains ``unknown field `text`,`` verbatim; only removal
    // tells the two apart.
    let (_, key, ..) = fault(&flow("{ type: text, text: keep, \"text`, x\": 1 }"));
    assert_eq!(key.as_deref(), Some("text`, x"));
}

#[test]
fn of_two_unknown_keys_the_one_serde_reports_is_named() {
    let (_, key, ..) = fault(&flow(
        "{ type: rect, box: { w: 1, h: 1 }, bogusA: 1, bogusB: 2 }",
    ));
    assert_eq!(key.as_deref(), Some("bogusA"));
}

#[test]
fn a_long_unknown_key_is_bounded_in_the_error() {
    let long = "k".repeat(1000);
    let item = format!("{{ type: rect, box: {{ w: 1, h: 1 }}, {long}: 1 }}");
    let (_, key, ..) = fault(&flow(&item));
    let key = key.expect("key");
    assert!(
        key.chars().count() <= 201,
        "unbounded key ({} chars)",
        key.chars().count()
    );
}

#[test]
fn a_wide_item_list_is_located_without_descending_the_good_ones() {
    let many = vec![GOOD_TEXT; 20_000].join(", ");
    let (path, ..) = fault(&flow(&format!("{many}, {BAD_LINE}")));
    assert_eq!(path, "sections.body.items[20000]");
}

#[test]
fn nesting_at_the_container_depth_cap_is_located_to_the_deepest_item() {
    // `MAX_CONTAINER_DEPTH` containers, the bad line inside the last. The
    // path is longer than an echo may be, so it arrives clipped; the key is
    // read off the node and arrives whole.
    let mut item = BAD_LINE.to_owned();
    for _ in 0..crate::template::MAX_CONTAINER_DEPTH {
        item = format!("{{ type: container, items: [ {item} ] }}");
    }
    let (path, key, ..) = fault(&flow(&item));
    assert!(
        path.starts_with("sections.body.items[0].items[0].items[0]"),
        "{path}"
    );
    assert!(path.ends_with('…'), "{path}");
    assert_eq!(key.as_deref(), Some("styleNames"));
}
