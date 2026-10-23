//! [`Item::child_lists`]: each of the four holders yields its box with the
//! array scope it places it under, a table yields only its `cell:` columns
//! in column order, every leaf kind yields none, and [`ChildList`]'s paths
//! spell each holder's address.

use super::{ChildHolder, ChildList};
use crate::template::{ContainerItem, Item, ItemKind};

fn item(yaml: &str) -> Item {
    crate::yaml::from_str(yaml).unwrap_or_else(|e| panic!("{yaml}: {e}"))
}

fn kinds(list: &ChildList<'_>) -> Vec<ItemKind> {
    list.container.items.iter().map(Item::kind).collect()
}

#[test]
fn a_container_is_its_own_box_in_its_parents_scope() {
    let container = item(
        "{ type: container, styleNames: [boxed], items: [{ type: text }, { type: page_break }] }",
    );
    let lists = container.child_lists();
    assert_eq!(lists.len(), 1);
    assert_eq!(lists[0].holder, ChildHolder::Container);
    assert_eq!(lists[0].array_key, None);
    assert_eq!(lists[0].container.style_names, ["boxed"]);
    assert_eq!(kinds(&lists[0]), [ItemKind::Text, ItemKind::PageBreak]);
}

#[test]
fn a_repeat_and_a_repeat_flow_scope_their_box_to_their_array() {
    let repeat = item(
        "{ type: repeat, data: { key: rows }, cell: { styleNames: [cell], items: [{ type: text }] } }",
    );
    let lists = repeat.child_lists();
    assert_eq!(lists.len(), 1);
    assert_eq!(lists[0].holder, ChildHolder::RepeatCell);
    assert_eq!(lists[0].array_key, Some("rows"));
    assert_eq!(lists[0].container.style_names, ["cell"]);
    assert_eq!(kinds(&lists[0]), [ItemKind::Text]);

    let rf = item(
        "{ type: repeat_flow, data: { key: cards }, item: { styleNames: [card], items: [{ type: image }] } }",
    );
    let lists = rf.child_lists();
    assert_eq!(lists.len(), 1);
    assert_eq!(lists[0].holder, ChildHolder::RepeatFlowCard);
    assert_eq!(lists[0].array_key, Some("cards"));
    assert_eq!(lists[0].container.style_names, ["card"]);
    assert_eq!(kinds(&lists[0]), [ItemKind::Image]);
}

#[test]
fn a_table_yields_its_cell_columns_in_order_and_skips_its_data_columns() {
    let table = item(
        r#"
type: table
data: { key: lines }
columns:
  - { label: name, data: { key: name } }
  - { label: note, cell: { items: [{ type: text }] } }
  - { label: mark, cell: { items: [{ type: checkbox }, { type: ellipse }] } }
"#,
    );
    let lists = table.child_lists();
    let holders: Vec<ChildHolder> = lists.iter().map(|l| l.holder).collect();
    assert_eq!(
        holders,
        [
            ChildHolder::ColumnCell { column: 1 },
            ChildHolder::ColumnCell { column: 2 },
        ]
    );
    assert!(lists.iter().all(|l| l.array_key == Some("lines")));
    assert_eq!(kinds(&lists[0]), [ItemKind::Text]);
    assert_eq!(kinds(&lists[1]), [ItemKind::Checkbox, ItemKind::Ellipse]);

    let no_columns = item("{ type: table, data: { key: rows }, columns: [] }");
    assert!(no_columns.child_lists().is_empty());
}

#[test]
fn every_leaf_kind_nests_no_box() {
    let leaves = [
        "{ type: text }",
        "{ type: rect, box: { x: 0, y: 0, w: 10, h: 10 } }",
        "{ type: line, from: { x: 0, y: 0 }, to: { x: 10, y: 0 } }",
        "{ type: page_number }",
        "{ type: image }",
        "{ type: qr_code }",
        "{ type: list, data: { key: rows } }",
        "{ type: page_break }",
        "{ type: char_grid, grid: { charsPerLine: 2, lines: 2, cellSize: 10 } }",
        "{ type: ellipse }",
        "{ type: checkbox }",
    ];
    for yaml in leaves {
        assert!(item(yaml).child_lists().is_empty(), "`{yaml}` nests a box");
    }
}

#[test]
fn the_paths_spell_each_holders_address() {
    let empty: ContainerItem = crate::yaml::from_str("{ items: [] }").expect("a container");
    let list = |holder| ChildList {
        holder,
        container: &empty,
        array_key: None,
    };
    let at = "sections.body.items[3]";
    let paths = |holder| {
        let l = list(holder);
        (l.box_path(at), l.items_path(at))
    };
    assert_eq!(
        paths(ChildHolder::Container),
        (at.to_string(), format!("{at}.items"))
    );
    assert_eq!(
        paths(ChildHolder::RepeatCell),
        (format!("{at}.cell"), format!("{at}.cell.items"))
    );
    assert_eq!(
        paths(ChildHolder::RepeatFlowCard),
        (format!("{at}.item"), format!("{at}.item.items"))
    );
    assert_eq!(
        paths(ChildHolder::ColumnCell { column: 2 }),
        (
            format!("{at}.columns[2].cell"),
            format!("{at}.columns[2].cell.items")
        )
    );
}
