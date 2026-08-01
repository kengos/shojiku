//! Finding the per-element cells: which tables carry `type: image`
//! columns, and which `data:`-bound `image` items sit inside a cell —
//! a `repeat`/`repeat_flow` cell or a table column's `cell:`.

use shojiku_core::{Body, Item, TableItem, Template};

use super::CellImage;

/// Every table in the body — the flow ones AND the bounded ones nested
/// in containers — with its diagnostics path. Mirrors the recursion
/// `validate`'s table walk does: a table placed in a container is a
/// bounded block, but its `type: image` columns load per-element assets
/// exactly like a flow table's.
pub(super) fn body_tables(template: &Template) -> Vec<(String, &TableItem)> {
    fn push_from<'a>(items: &'a [Item], prefix: &str, out: &mut Vec<(String, &'a TableItem)>) {
        for (index, item) in items.iter().enumerate() {
            let path = format!("{prefix}[{index}]");
            match item {
                Item::Table(table) => out.push((path, table.as_ref())),
                Item::Container(container) => {
                    push_from(&container.items, &format!("{path}.items"), out);
                }
                _ => {}
            }
        }
    }
    let mut out = Vec::new();
    let body_items: &[Item] = match &template.sections.body {
        Body::Flow(flow) => &flow.items,
        Body::Absolute(abs) => &abs.items,
    };
    push_from(body_items, "sections.body.items", &mut out);
    out
}

/// Every `data:`-bound `image` item inside a per-element cell — a
/// `repeat`/`repeat_flow` cell or a table column's `cell:` — recursing
/// into containers within the cell, with the array key it is scoped to.
/// Static `src:` cell images are handled by the shared walk.
pub(super) fn element_cell_images(template: &Template) -> Vec<CellImage<'_>> {
    fn cell_items<'a>(
        items: &'a [Item],
        array_key: &'a str,
        prefix: &str,
        out: &mut Vec<CellImage<'a>>,
    ) {
        for (i, item) in items.iter().enumerate() {
            let path = format!("{prefix}[{i}]");
            match item {
                Item::Image(image) => {
                    // `src` wins over `data` at layout (the conflict is a
                    // validate error; best-effort render shows the static
                    // image), so a src-carrying item loads no per-element
                    // assets — mirroring `guarded_image_atom`. A
                    // `scope: document` binding is one shared asset, so it
                    // loads through the shared walk instead.
                    if super::super::is_element_scoped(image) {
                        if let Some(binding) = &image.data {
                            out.push(CellImage {
                                array_key,
                                binding_key: &binding.key,
                                ident: image.id.as_deref(),
                                path,
                            });
                        }
                    }
                }
                Item::Container(container) => {
                    cell_items(&container.items, array_key, &format!("{path}.items"), out);
                }
                _ => {}
            }
        }
    }
    fn walk<'a>(items: &'a [Item], prefix: &str, out: &mut Vec<CellImage<'a>>) {
        for (i, item) in items.iter().enumerate() {
            let path = format!("{prefix}[{i}]");
            match item {
                Item::Repeat(repeat) => cell_items(
                    &repeat.cell.items,
                    &repeat.data.key,
                    &format!("{path}.cell.items"),
                    out,
                ),
                Item::RepeatFlow(rf) => cell_items(
                    &rf.item.items,
                    &rf.data.key,
                    &format!("{path}.item.items"),
                    out,
                ),
                // A `cell:` column's images are element-scoped to the
                // table's rows, like a repeat cell's to its elements.
                Item::Table(table) => {
                    for (ci, column) in table.columns.iter().enumerate() {
                        if let Some(cell) = &column.cell {
                            cell_items(
                                &cell.items,
                                &table.data.key,
                                &format!("{path}.columns[{ci}].cell.items"),
                                out,
                            );
                        }
                    }
                }
                Item::Container(container) => {
                    walk(&container.items, &format!("{path}.items"), out);
                }
                _ => {}
            }
        }
    }
    let mut out = Vec::new();
    let body_items: &[Item] = match &template.sections.body {
        Body::Flow(flow) => &flow.items,
        Body::Absolute(abs) => &abs.items,
    };
    walk(body_items, "sections.body.items", &mut out);
    out
}
