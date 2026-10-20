//! [`Item::child_lists`] — the boxes of items an item nests, named by what
//! holds them.
//!
//! Four kinds nest items, each in a [`ContainerItem`]: a `container` is one,
//! and a `repeat` cell, a `repeat_flow` card and a table column's `cell:`
//! each hold one. This is the descent step for a walk over the whole item
//! tree: a walk that asks each item here, rather than matching those four,
//! has no holder to forget. A walk that deliberately stops at some
//! holders (cells, say) filters on [`ChildList::holder`].

use super::{ContainerItem, Item};

#[cfg(test)]
mod tests;

/// What holds a [`ChildList`], which decides its template path and whether
/// its items are scoped to an array element.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChildHolder {
    /// A `container` item itself.
    Container,
    /// A `repeat`'s `cell:`, placed once per array element.
    RepeatCell,
    /// A `repeat_flow`'s `item:`, placed once per array element.
    RepeatFlowCard,
    /// The `cell:` of the table column at this index, placed once per row.
    ColumnCell { column: usize },
}

/// One box of items an item nests.
#[derive(Debug, Clone, Copy)]
pub struct ChildList<'a> {
    pub holder: ChildHolder,
    /// The box itself: its own `styleNames` / `box` / `style` as well as
    /// its `items`.
    pub container: &'a ContainerItem,
    /// The array params key the items are scoped to: the element a `repeat`
    /// cell, a `repeat_flow` card or a table column's `cell:` is placed for.
    /// `None` for a `container`, whose items keep their PARENT's scope (so
    /// a scope-tracking walk reads it as `array_key.or(parent)`, never as
    /// document scope).
    pub array_key: Option<&'a str>,
}

impl ChildList<'_> {
    /// The template path of the box, under the path of the item holding
    /// it: the item's own path for a `container`, else `<item>.cell`,
    /// `<item>.item` or `<item>.columns[<i>].cell`.
    pub fn box_path(&self, item_path: &str) -> String {
        match self.holder {
            ChildHolder::Container => item_path.to_string(),
            ChildHolder::RepeatCell => format!("{item_path}.cell"),
            ChildHolder::RepeatFlowCard => format!("{item_path}.item"),
            ChildHolder::ColumnCell { column } => format!("{item_path}.columns[{column}].cell"),
        }
    }

    /// The template path of the box's `items:` list, under the path of the
    /// item holding it: [`ChildList::box_path`] + `.items`.
    pub fn items_path(&self, item_path: &str) -> String {
        format!("{}.items", self.box_path(item_path))
    }
}

impl Item {
    /// The boxes of items this item nests, in document order; empty for a
    /// kind that nests none. A table yields one per column that has a
    /// `cell:`, and none for its `data:` columns.
    pub fn child_lists(&self) -> Vec<ChildList<'_>> {
        match self {
            Item::Container(container) => vec![ChildList {
                holder: ChildHolder::Container,
                container,
                array_key: None,
            }],
            Item::Repeat(repeat) => vec![ChildList {
                holder: ChildHolder::RepeatCell,
                container: &repeat.cell,
                array_key: Some(&repeat.data.key),
            }],
            Item::RepeatFlow(rf) => vec![ChildList {
                holder: ChildHolder::RepeatFlowCard,
                container: &rf.item,
                array_key: Some(&rf.data.key),
            }],
            Item::Table(table) => table
                .columns
                .iter()
                .enumerate()
                .filter_map(|(column, col)| {
                    col.cell.as_ref().map(|cell| ChildList {
                        holder: ChildHolder::ColumnCell { column },
                        container: cell,
                        array_key: Some(&table.data.key),
                    })
                })
                .collect(),
            // Every leaf kind is spelled out, so a new nesting kind cannot
            // compile until it says here which boxes it holds.
            Item::Text(_)
            | Item::Rect(_)
            | Item::Line(_)
            | Item::PageNumber(_)
            | Item::Image(_)
            | Item::QrCode(_)
            | Item::List(_)
            | Item::PageBreak(_)
            | Item::CharGrid(_)
            | Item::Ellipse(_)
            | Item::Checkbox(_) => Vec::new(),
        }
    }
}
