//! Catalog resolution: the page's schema fragment, the three selector
//! forms, and the degrade path a malformed catalog would take.

use super::*;
use crate::reference::find;

#[test]
fn a_pages_defs_are_exactly_its_declared_shapes() {
    let page = find("box").expect("box");
    let defs = defs(page);
    let map = defs["$defs"].as_object().expect("$defs");
    let names: Vec<&String> = map.keys().collect();
    assert_eq!(
        names,
        ["BoxType", "EdgeMapRepr", "EdgeSpec", "EdgeValue", "OptBox"],
        "every declared shape, and nothing else"
    );
    // The prose is the AUTHORED annotation layer, not a schemars-lifted
    // doc comment — a node with no description would mean the merge lost it.
    for (name, node) in map {
        assert!(
            node["description"].as_str().is_some_and(|d| d.len() > 10),
            "{name} carries no authored description"
        );
    }
}

#[test]
fn a_page_that_declares_no_shapes_gets_an_empty_defs() {
    // Eleven pages are in this state; the part is emitted anyway so a
    // client's reader does not have to branch on which page it asked for.
    let page = find("rect").expect("rect");
    assert!(page.shapes.is_empty());
    assert_eq!(
        defs(page),
        json!({ "$comment": REF_RESOLUTION, "$defs": {} })
    );
}

#[test]
fn a_shape_selector_resolves_to_the_whole_node() {
    let page = find("box").expect("box");
    let matches = resolve(page, "EdgeSpec");
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].shape, "EdgeSpec");
    assert_eq!(matches[0].key, None);
    assert_eq!(matches[0].schema, defs(page)["$defs"]["EdgeSpec"]);
}

#[test]
fn a_qualified_selector_resolves_to_one_property() {
    let page = find("table").expect("table");
    let matches = resolve(page, "Column.style");
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].shape, "Column");
    assert_eq!(matches[0].key.as_deref(), Some("style"));
    assert!(matches[0].schema.is_object());
}

#[test]
fn a_selector_that_names_nothing_resolves_to_nothing() {
    let page = find("box").expect("box");
    for miss in [
        "noSuchKey",
        "OptBox.noSuchKey",
        // A shape that exists in the catalog but not on THIS page: the
        // address space is page-scoped, so it is a miss here.
        "Column",
        "Column.style",
        // A key of a shape the page does not declare.
        "NoSuchShape.margin",
    ] {
        assert!(resolve(page, miss).is_empty(), "{miss} should not resolve");
    }
}

#[test]
fn the_matches_body_names_the_page_and_the_selector() {
    let page = find("box").expect("box");
    let matches = resolve(page, "margin");
    let body = matches_body(page, "margin", &matches);
    assert_eq!(body["page"], "box");
    assert_eq!(body["fragment"], "margin");
    let items = body["matches"].as_array().expect("matches");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["shape"], "OptBox");
    assert_eq!(items[0]["key"], "margin");
    assert!(items[0]["schema"].is_object());
    // A whole-shape match carries no `key`, so a reader can tell the two
    // answers apart without re-parsing the selector.
    let shape_body = matches_body(page, "EdgeSpec", &resolve(page, "EdgeSpec"));
    assert!(shape_body["matches"][0]["key"].is_null());
}

#[test]
fn a_catalog_that_cannot_be_read_degrades_to_an_empty_document() {
    // Unreachable against the committed artifact — the partition gate in
    // `super::super::tests` pins that every declared shape resolves — so
    // the degrade path is proven directly.
    for broken in ["", "{{{", "[1, 2, 3]", "\"a string\"", "null"] {
        assert_eq!(
            parse(broken),
            json!({}),
            "expected a degrade for {broken:?}"
        );
    }
    // Positive control: the REAL catalog does parse, so the assertions
    // above are about malformed input rather than a parser that never works.
    let real = parse(shojiku_authoring::reference::CATALOG);
    assert_eq!(real["$defs"].as_object().expect("$defs").len(), 84);
}

#[test]
fn a_shape_the_catalog_does_not_define_is_skipped_rather_than_faked() {
    // `defs` and `resolve` both look the name up; a page declaring a shape
    // the catalog dropped yields no node instead of an empty stub. The
    // partition gate is what stops this reaching the wire.
    assert!(shape("NoSuchShape").is_none());
    assert!(property("NoSuchShape", "margin").is_none());
    assert!(property("OptBox", "noSuchKey").is_none());
}
