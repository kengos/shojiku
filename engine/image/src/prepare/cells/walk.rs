//! Finding the per-element cells: which tables carry `type: image`
//! columns, and which `data:`-bound `image` items sit inside a cell —
//! a `repeat`/`repeat_flow` cell or a table column's `cell:`.

use shojiku_core::{ChildHolder, Item, TableItem, Template};

use super::CellImage;

/// Every table the template holds — the flow ones, the bounded ones
/// nested in containers, and the ones in the header and footer bands —
/// with its diagnostics path. Mirrors the recursion `validate`'s table
/// walk does: a bounded or band table is one block, but its `type: image`
/// columns load per-element assets exactly like a flow table's.
pub(super) fn tables(template: &Template) -> Vec<(String, &TableItem)> {
    fn push_from<'a>(items: &'a [Item], prefix: &str, out: &mut Vec<(String, &'a TableItem)>) {
        for (index, item) in items.iter().enumerate() {
            let path = format!("{prefix}[{index}]");
            if let Item::Table(table) = item {
                out.push((path.clone(), table.as_ref()));
            }
            for list in item.child_lists() {
                if list.holder == ChildHolder::Container {
                    push_from(&list.container.items, &list.items_path(&path), out);
                }
            }
        }
    }
    let mut out = Vec::new();
    for (prefix, items) in template.sections.item_lists() {
        push_from(items, prefix, &mut out);
    }
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
            if let Item::Image(image) = item {
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
                            path: path.clone(),
                        });
                    }
                }
            }
            for list in item.child_lists() {
                if list.holder == ChildHolder::Container {
                    cell_items(
                        &list.container.items,
                        array_key,
                        &list.items_path(&path),
                        out,
                    );
                }
            }
        }
    }
    /// `repeats` is false in a header/footer band, where layout skips a
    /// `repeat`/`repeat_flow` (`repeat_in_band`): loading assets nothing
    /// draws would only spend the shared cap the drawn cells need.
    fn walk<'a>(items: &'a [Item], prefix: &str, repeats: bool, out: &mut Vec<CellImage<'a>>) {
        for (i, item) in items.iter().enumerate() {
            let path = format!("{prefix}[{i}]");
            for list in item.child_lists() {
                let items_path = list.items_path(&path);
                // A container keeps walking at this level; every other box
                // is a per-element cell, scoped to the array it is placed
                // for — a `cell:` column's images to the table's rows, like
                // a repeat cell's to its elements.
                let Some(array_key) = list.array_key else {
                    walk(&list.container.items, &items_path, repeats, out);
                    continue;
                };
                if repeats || matches!(list.holder, ChildHolder::ColumnCell { .. }) {
                    cell_items(&list.container.items, array_key, &items_path, out);
                }
            }
        }
    }
    let mut out = Vec::new();
    for (prefix, items) in template.sections.item_lists() {
        walk(items, prefix, prefix == "sections.body.items", &mut out);
    }
    out
}
