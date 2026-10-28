//! Re-locating a template parse failure to the item that raised it, driven
//! through `parse_template`: every item holder, the key-or-no-key split, the
//! cases that must keep serde's own error (a failure an item repeats exactly
//! included), and the hostile shapes.

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
    // `fontSizee` is unknown on the item's STYLE, not on the item: serde
    // failed two keys below the item, so no key is offered.
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
    // serde's path puts the failure below that key, and naming the item's key
    // would have the quick-fix delete content while the document still fails.
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
    // ``text`, x`` contains ``unknown field `text`,`` verbatim; serde's path
    // segment names the one it failed at.
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
    // the one segment serde failed at below the item, and arrives whole.
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

#[test]
fn an_unknown_key_serde_fails_at_is_named_whatever_else_would_fail() {
    // The line also lacks its ends, but serde fails at `styleNames` first,
    // one key below the item, so that key is named.
    let (_, key, ..) = fault(&flow("{ type: line, styleNames: [ a ] }"));
    assert_eq!(key.as_deref(), Some("styleNames"));
    let (path, key, ..) = fault(&flow("{ type: line }"));
    assert_eq!(path, "sections.body.items[0]");
    assert_eq!(key, None);
}

#[test]
fn the_same_unknown_key_at_the_root_is_not_blamed_on_an_item() {
    // The root rejects `bogus` first; the root is no buffered node, so the
    // item rejecting a key of the same name is never read, the error stays
    // where serde put it and no key is offered.
    let yaml = format!("bogus: 1\n{}", flow("{ type: text, text: a, bogus: 1 }"));
    let (path, key, line, _) = fault(&yaml);
    assert_eq!(path, "bogus");
    assert_eq!(key, None);
    assert_eq!(line, 1);
}

#[test]
fn the_same_failure_in_another_section_is_not_blamed_on_its_item() {
    // The body fails first, on its missing `type`; a footer item missing
    // its own `type` fails the same way, but the body has no tag to read
    // further, so the error stays at the body.
    let yaml = "sections:\n  body:\n    items: []\n  footer:\n    items:\n      - { text: a }\n";
    let (path, key, ..) = fault(yaml);
    assert_eq!(path, "sections.body");
    assert_eq!(key, None);
}

/// A `repeat_flow` whose own `gap` is the same bad value a flow body's can be.
const BAD_GAP_ITEM: &str =
    "{ type: repeat_flow, data: { key: rows }, item: { items: [] }, gap: [ 1 ] }";

#[test]
fn a_body_field_an_item_repeats_exactly_stays_the_bodys() {
    // The body's own field fails first; an item failing alone the same way
    // is not where serde failed, so serde's error and location stand.
    for (field, item) in [
        ("gap: [ 1 ]", BAD_GAP_ITEM),
        (
            "box: { x: [ 1 ], y: 0, w: 1, h: 1 }",
            "{ type: text, text: a, box: { x: [ 1 ] } }",
        ),
    ] {
        let yaml =
            format!("sections:\n  body:\n    type: flow\n    {field}\n    items: [ {item} ]\n");
        let (path, key, line, _) = fault(&yaml);
        assert_eq!(path, "sections.body", "{field}");
        assert_eq!(key, None, "{field}");
        assert!(line > 0, "{field}: serde's location is kept");
    }
}

#[test]
fn a_body_field_after_the_items_fails_after_them() {
    // Document order decides: the item comes first, so it is the failure.
    let yaml = format!(
        "sections:\n  body:\n    type: flow\n    items: [ {BAD_GAP_ITEM} ]\n    gap: [ 1 ]\n"
    );
    let (path, key, ..) = fault(&yaml);
    assert_eq!(path, "sections.body.items[0]");
    assert_eq!(key, None);
    let yaml =
        format!("sections:\n  body:\n    type: flow\n    items: [ {BAD_LINE} ]\n    gap: [ 1 ]\n");
    let (path, key, ..) = fault(&yaml);
    assert_eq!(path, "sections.body.items[0]");
    assert_eq!(key.as_deref(), Some("styleNames"));
}

#[test]
fn a_container_field_its_child_repeats_exactly_stays_the_containers() {
    let item = "{ type: container, box: { bogus: 1 }, items: [ { type: text, text: a, box: { bogus: 1 } } ] }";
    let (path, key, ..) = fault(&flow(item));
    assert_eq!(path, "sections.body.items[0]");
    assert_eq!(key, None);
    let yaml = format!(
        "sections:\n  header:\n    items: [ {item} ]\n  body:\n    type: flow\n    items: []\n"
    );
    let (path, key, ..) = fault(&yaml);
    assert_eq!(path, "sections.header.items[0]");
    assert_eq!(key, None);
}

#[test]
fn of_two_items_failing_the_same_way_the_first_is_named() {
    let bad = "{ type: rect, box: { w: 1, h: 1 }, bogus: 1 }";
    let (path, key, ..) = fault(&flow(&format!("{GOOD_TEXT}, {bad}, {bad}")));
    assert_eq!(path, "sections.body.items[1]");
    assert_eq!(key.as_deref(), Some("bogus"));
}

#[test]
fn every_item_kind_names_its_own_unknown_key() {
    for kind in crate::template::ItemKind::ALL {
        let item = format!("{{ type: {}, bogusKey: 1 }}", kind.as_str());
        let (path, key, ..) = fault(&flow(&item));
        assert_eq!(path, "sections.body.items[0]", "{item}");
        assert_eq!(key.as_deref(), Some("bogusKey"), "{item}");
    }
}

#[test]
fn a_non_string_item_type_names_the_item_but_no_key() {
    let (path, key, ..) = fault(&flow(&format!("{GOOD_TEXT}, {{ type: [ 1 ], text: a }}")));
    assert_eq!(path, "sections.body.items[1]");
    assert_eq!(key, None);
}

#[test]
fn a_null_list_ahead_of_an_unknown_key_names_no_key() {
    // serde refuses the `null`, the item's own `items`, before it reaches
    // `bogus`: the item is named, and the key it fails on is not `bogus`.
    let item = "{ type: container, items: ~, bogus: 1 }";
    let yaml = format!(
        "sections:\n  header:\n    items: [ {item} ]\n  body:\n    type: flow\n    items: []\n"
    );
    let (path, key, ..) = fault(&yaml);
    assert_eq!(path, "sections.header.items[0]");
    assert_eq!(key, None);
    let (path, key, ..) = fault(&flow(item));
    assert_eq!(path, "sections.body.items[0]");
    assert_eq!(key, None);
}

#[test]
fn a_root_key_spelled_like_the_bodys_path_keeps_serdes_error() {
    // serde spells the unknown root key `sections.body`, the body's own
    // path; the body's failure is another one, so it is not followed.
    let yaml = format!("\"sections.body\": 1\n{}", flow(BAD_LINE));
    let (path, key, line, _) = fault(&yaml);
    assert_eq!(path, "sections.body");
    assert_eq!(key, None);
    assert_eq!(line, 1);
}

#[test]
fn a_path_the_tree_does_not_hold_resolves_to_nothing() {
    use serde_path_to_error::Segment;
    let mapping = crate::yaml::Value::Mapping(Vec::new());
    let index = Segment::Seq { index: 0 };
    assert!(super::descend(&mapping, &[&index], &mut String::new()).is_none());
}

#[test]
fn a_null_field_a_child_repeats_stays_the_containers() {
    // serde refuses a `null` list wherever it lands, so the container's own
    // `styleNames: ~` fails before its child's; the tree read refuses it too.
    let child = "{ type: container, styleNames: ~ }";
    let item = format!("{{ type: container, styleNames: ~, items: [ {child} ] }}");
    let (path, key, ..) = fault(&flow(&item));
    assert_eq!(path, "sections.body.items[0]");
    assert_eq!(key, None);
}

#[test]
fn a_numeric_item_type_names_the_item_but_no_key() {
    // serde takes `0` as a variant index, and so does the tree read; the tag
    // is not a string this read can follow further, so no key is named.
    let (path, key, ..) = fault(&flow("{ type: 0, bogus: 1 }"));
    assert_eq!(path, "sections.body.items[0]");
    assert_eq!(key, None);
}

#[test]
fn an_empty_unit_payload_serde_takes_does_not_stop_the_walk() {
    // serde reads `stretch: {}` as the unit variant; the child's
    // `stretch: { a: 1 }` is the failure, and the tree read takes `{}` too.
    let child = "{ type: text, text: a, box: { alignItems: { stretch: { a: 1 } } } }";
    let item = format!(
        "{{ type: container, box: {{ alignItems: {{ stretch: {{}} }} }}, items: [ {child} ] }}"
    );
    let (path, key, ..) = fault(&flow(&item));
    assert_eq!(path, "sections.body.items[0].items[0]");
    assert_eq!(key, None);
}
