//! Template walks that gather items for cross-checks (tables, images,
//! repeats) and enforce the container depth cap. Every walk starts from
//! `Sections::item_lists`, so all of them cover the header and footer
//! bands as well as the body.

use crate::template::{ChildHolder, Item, Template, MAX_CONTAINER_DEPTH};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};

/// A data-driven repeat construct found in any section — the n-up `repeat`
/// or the flow `repeat_flow` — normalized so `validate` runs one shared
/// array-group + cell-binding check over both.
pub(super) struct RepeatRef<'a> {
    /// Template path of the repeat item itself.
    pub path: String,
    /// The item `type:` name, used in diagnostic messages.
    pub kind: &'static str,
    /// The bound array params key.
    pub key: &'a str,
    /// The per-element sub-template's children.
    pub cell_items: &'a [Item],
    /// Template path of those children (`…cell.items` / `…item.items`).
    pub cell_path: String,
}

/// Every repeat the template holds. A band-level one is skipped by layout
/// (`repeat_in_band`), as a nested one is (`repeat_in_container`) — both
/// still get their binding check, so the fix is not hidden behind the
/// placement warning.
pub(super) fn collect_repeats(template: &Template) -> Vec<RepeatRef<'_>> {
    fn push_from<'a>(items: &'a [Item], prefix: &str, repeats: &mut Vec<RepeatRef<'a>>) {
        for (i, item) in items.iter().enumerate() {
            let path = format!("{prefix}[{i}]");
            // A nested repeat (inside a cell, a card or a `cell:` column)
            // is unsupported at layout, but still gets its own binding
            // check.
            match item {
                Item::Repeat(repeat) => repeats.push(RepeatRef {
                    path: path.clone(),
                    kind: "repeat",
                    key: &repeat.data.key,
                    cell_items: &repeat.cell.items,
                    cell_path: format!("{path}.cell.items"),
                }),
                Item::RepeatFlow(rf) => repeats.push(RepeatRef {
                    path: path.clone(),
                    kind: "repeat_flow",
                    key: &rf.data.key,
                    cell_items: &rf.item.items,
                    cell_path: format!("{path}.item.items"),
                }),
                _ => {}
            }
            for list in item.child_lists() {
                push_from(&list.container.items, &list.items_path(&path), repeats);
            }
        }
    }
    let mut repeats = Vec::new();
    for (prefix, items) in template.sections.item_lists() {
        push_from(items, prefix, &mut repeats);
    }
    repeats
}

/// Errors on container chains deeper than [`MAX_CONTAINER_DEPTH`]. A parsed
/// template reaches this with its `items:` lists already bounded — the parse
/// refuses a deeper one with this same code and path — so what is left for
/// it is a holder past the cap with no `items:` list, and a template
/// deserialized some other way; the recursion is bounded either way, by that
/// check or by the parser's own depth limit.
pub(super) fn check_container_depth(
    items: &[Item],
    depth: usize,
    prefix: &str,
    diags: &mut Diagnostics,
) {
    for (i, item) in items.iter().enumerate() {
        let item_path = format!("{prefix}[{i}]");
        // A `repeat` cell, a `repeat_flow` card and every `cell:` column
        // is a container-equivalent box occupying this depth level, so its
        // children nest one deeper — each column independently.
        for list in item.child_lists() {
            if depth > MAX_CONTAINER_DEPTH {
                // An over-deep column is reported at the column, one level
                // above its `cell:` box; every other box at its item.
                let path = match list.holder {
                    ChildHolder::ColumnCell { column } => format!("{item_path}.columns[{column}]"),
                    _ => item_path,
                };
                diags.push(
                    Diagnostic::new(Code::ContainerDepthExceeded)
                        .arg("max", MAX_CONTAINER_DEPTH)
                        .with_path(path),
                );
                return;
            }
            check_container_depth(
                &list.container.items,
                depth + 1,
                &list.items_path(&item_path),
                diags,
            );
        }
    }
}

/// Generic every-item walk over all three sections, descending into
/// containers and repeat cells, with the item's template path.
pub(super) fn walk_sections(template: &Template, f: &mut impl FnMut(&Item, &str)) {
    fn walk(items: &[Item], prefix: &str, f: &mut impl FnMut(&Item, &str)) {
        for (i, item) in items.iter().enumerate() {
            let path = format!("{prefix}[{i}]");
            f(item, &path);
            for list in item.child_lists() {
                walk(&list.container.items, &list.items_path(&path), f);
            }
        }
    }
    for (prefix, items) in template.sections.item_lists() {
        walk(items, prefix, f);
    }
}

pub(super) fn collect_images(template: &Template) -> Vec<(String, &crate::template::ImageItem)> {
    fn push_from<'a>(
        items: &'a [Item],
        prefix: &str,
        images: &mut Vec<(String, &'a crate::template::ImageItem)>,
    ) {
        for (i, item) in items.iter().enumerate() {
            let path = format!("{prefix}[{i}]");
            if let Item::Image(image) = item {
                images.push((path.clone(), image));
            }
            // An image in a `repeat`/`repeat_flow` cell or a table
            // column's `cell:` is drawn element-scoped (a static `src:`
            // shared, a `data:` per element), so its src/data exclusivity
            // is checked like any other image.
            for list in item.child_lists() {
                push_from(&list.container.items, &list.items_path(&path), images);
            }
        }
    }
    let mut images = Vec::new();
    for (prefix, items) in template.sections.item_lists() {
        push_from(items, prefix, &mut images);
    }
    images
}

pub(super) fn collect_tables(template: &Template) -> Vec<(String, &crate::template::TableItem)> {
    fn push_from<'a>(
        items: &'a [Item],
        prefix: &str,
        tables: &mut Vec<(String, &'a crate::template::TableItem)>,
    ) {
        for (i, item) in items.iter().enumerate() {
            let path = format!("{prefix}[{i}]");
            if let Item::Table(table) = item {
                tables.push((path.clone(), table));
            }
            // Tables inside a `repeat`/table cell are unsupported (layout
            // warns + skips), so only a container is descended into.
            for list in item.child_lists() {
                if list.holder == ChildHolder::Container {
                    push_from(&list.container.items, &list.items_path(&path), tables);
                }
            }
        }
    }
    // A band table is one bounded block layout draws on every page it
    // repeats on, so it is checked like a body one.
    let mut tables = Vec::new();
    for (prefix, items) in template.sections.item_lists() {
        push_from(items, prefix, &mut tables);
    }
    tables
}
