//! [`ItemKind`]: one parsed item of every kind reports the kind its `type:`
//! names, and [`ItemKind::ALL`] holds each kind exactly once.

use super::{Item, ItemKind};
use std::collections::BTreeSet;

/// The smallest item of each kind the parser takes, as flow YAML.
const ONE_OF_EACH: [&str; 15] = [
    "{ type: text }",
    "{ type: rect, box: { x: 0, y: 0, w: 10, h: 10 } }",
    "{ type: line, from: { x: 0, y: 0 }, to: { x: 10, y: 0 } }",
    "{ type: table, data: { key: rows }, columns: [] }",
    "{ type: page_number }",
    "{ type: image }",
    "{ type: container }",
    "{ type: repeat, data: { key: rows }, cell: { items: [] } }",
    "{ type: repeat_flow, data: { key: rows }, item: { items: [] } }",
    "{ type: qr_code }",
    "{ type: list, data: { key: rows } }",
    "{ type: page_break }",
    "{ type: char_grid, grid: { charsPerLine: 2, lines: 2, cellSize: 10 } }",
    "{ type: ellipse }",
    "{ type: checkbox }",
];

#[test]
fn every_item_reports_the_kind_its_type_names() {
    for yaml in ONE_OF_EACH {
        let item: Item = crate::yaml::from_str(yaml).unwrap_or_else(|e| panic!("{yaml}: {e}"));
        let written = serde_json::to_value(&item).expect("an item serializes");
        assert_eq!(
            written["type"],
            item.kind().as_str(),
            "`{yaml}` reports a kind its `type:` does not name"
        );
    }
}

#[test]
fn all_lists_every_kind_once_in_declaration_order() {
    let parsed: Vec<ItemKind> = ONE_OF_EACH
        .iter()
        .map(|yaml| crate::yaml::from_str::<Item>(yaml).expect(yaml).kind())
        .collect();
    assert_eq!(parsed, ItemKind::ALL);
    let names: BTreeSet<&str> = ItemKind::ALL.iter().map(|k| k.as_str()).collect();
    assert_eq!(names.len(), ItemKind::ALL.len(), "two kinds share a name");
}
