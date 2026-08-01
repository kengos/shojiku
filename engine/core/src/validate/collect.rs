//! Template walks that gather items for cross-checks (tables, images,
//! repeats) and enforce the container depth cap.

use crate::template::{Body, Item, Template, MAX_CONTAINER_DEPTH};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};

/// A data-driven repeat construct found in the body — the n-up `repeat`
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

pub(super) fn collect_repeats(template: &Template) -> Vec<RepeatRef<'_>> {
    fn push_from<'a>(items: &'a [Item], prefix: &str, repeats: &mut Vec<RepeatRef<'a>>) {
        for (i, item) in items.iter().enumerate() {
            let path = format!("{prefix}[{i}]");
            // A nested repeat (inside a cell/card) is unsupported at
            // layout, but still gets its own binding check.
            match item {
                Item::Repeat(repeat) => {
                    let cell_path = format!("{path}.cell.items");
                    repeats.push(RepeatRef {
                        path,
                        kind: "repeat",
                        key: &repeat.data.key,
                        cell_items: &repeat.cell.items,
                        cell_path: cell_path.clone(),
                    });
                    push_from(&repeat.cell.items, &cell_path, repeats);
                }
                Item::RepeatFlow(rf) => {
                    let cell_path = format!("{path}.item.items");
                    repeats.push(RepeatRef {
                        path,
                        kind: "repeat_flow",
                        key: &rf.data.key,
                        cell_items: &rf.item.items,
                        cell_path: cell_path.clone(),
                    });
                    push_from(&rf.item.items, &cell_path, repeats);
                }
                Item::Container(container) => {
                    push_from(&container.items, &format!("{path}.items"), repeats);
                }
                Item::Table(table) => {
                    // A `repeat` inside a table column's `cell:` is
                    // unsupported at layout, but still gets its own
                    // binding check.
                    for (ci, column) in table.columns.iter().enumerate() {
                        if let Some(cell) = &column.cell {
                            push_from(
                                &cell.items,
                                &format!("{path}.columns[{ci}].cell.items"),
                                repeats,
                            );
                        }
                    }
                }
                _ => {}
            }
        }
    }
    let mut repeats = Vec::new();
    let body_items: &[Item] = match &template.sections.body {
        Body::Flow(flow) => &flow.items,
        Body::Absolute(abs) => &abs.items,
    };
    push_from(body_items, "sections.body.items", &mut repeats);
    repeats
}

/// Errors on container chains deeper than [`MAX_CONTAINER_DEPTH`]. The
/// recursion itself is safe: YAML parsing bounds template depth well below
/// any stack limit.
pub(super) fn check_container_depth(
    items: &[Item],
    depth: usize,
    prefix: &str,
    diags: &mut Diagnostics,
) {
    for (i, item) in items.iter().enumerate() {
        // A `repeat` cell / `repeat_flow` card is a container-equivalent
        // box occupying this depth level, so its children nest one deeper.
        let nested = match item {
            Item::Container(container) => Some((&container.items, format!("{prefix}[{i}].items"))),
            Item::Repeat(repeat) => Some((&repeat.cell.items, format!("{prefix}[{i}].cell.items"))),
            Item::RepeatFlow(rf) => Some((&rf.item.items, format!("{prefix}[{i}].item.items"))),
            // Every `cell:` column is its own container-equivalent box,
            // so each nests one level deeper independently.
            Item::Table(table) => {
                for (ci, column) in table.columns.iter().enumerate() {
                    let Some(cell) = &column.cell else { continue };
                    let path = format!("{prefix}[{i}].columns[{ci}]");
                    if depth > MAX_CONTAINER_DEPTH {
                        diags.push(
                            Diagnostic::new(Code::ContainerDepthExceeded)
                                .arg("max", MAX_CONTAINER_DEPTH)
                                .with_path(path),
                        );
                        return;
                    }
                    check_container_depth(
                        &cell.items,
                        depth + 1,
                        &format!("{path}.cell.items"),
                        diags,
                    );
                }
                None
            }
            _ => None,
        };
        if let Some((children, child_prefix)) = nested {
            let path = format!("{prefix}[{i}]");
            if depth > MAX_CONTAINER_DEPTH {
                diags.push(
                    Diagnostic::new(Code::ContainerDepthExceeded)
                        .arg("max", MAX_CONTAINER_DEPTH)
                        .with_path(path),
                );
                return;
            }
            check_container_depth(children, depth + 1, &child_prefix, diags);
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
            match item {
                Item::Container(container) => {
                    walk(&container.items, &format!("{path}.items"), f);
                }
                Item::Repeat(repeat) => {
                    walk(&repeat.cell.items, &format!("{path}.cell.items"), f);
                }
                Item::RepeatFlow(rf) => {
                    walk(&rf.item.items, &format!("{path}.item.items"), f);
                }
                Item::Table(table) => {
                    for (ci, column) in table.columns.iter().enumerate() {
                        if let Some(cell) = &column.cell {
                            walk(&cell.items, &format!("{path}.columns[{ci}].cell.items"), f);
                        }
                    }
                }
                _ => {}
            }
        }
    }
    if let Some(header) = &template.sections.header {
        walk(&header.items, "sections.header.items", f);
    }
    let body_items: &[Item] = match &template.sections.body {
        Body::Flow(flow) => &flow.items,
        Body::Absolute(abs) => &abs.items,
    };
    walk(body_items, "sections.body.items", f);
    if let Some(footer) = &template.sections.footer {
        walk(&footer.items, "sections.footer.items", f);
    }
}

pub(super) fn collect_images(template: &Template) -> Vec<(String, &crate::template::ImageItem)> {
    fn push_from<'a>(
        items: &'a [Item],
        prefix: &str,
        images: &mut Vec<(String, &'a crate::template::ImageItem)>,
    ) {
        for (i, item) in items.iter().enumerate() {
            match item {
                Item::Image(image) => images.push((format!("{prefix}[{i}]"), image)),
                Item::Container(container) => {
                    push_from(&container.items, &format!("{prefix}[{i}].items"), images);
                }
                // A `repeat`/`repeat_flow` cell image is drawn element-scoped
                // (a static `src:` shared, a `data:` per element), so its
                // src/data exclusivity is checked like any other image.
                Item::Repeat(repeat) => {
                    push_from(
                        &repeat.cell.items,
                        &format!("{prefix}[{i}].cell.items"),
                        images,
                    );
                }
                Item::RepeatFlow(rf) => {
                    push_from(&rf.item.items, &format!("{prefix}[{i}].item.items"), images);
                }
                // A table column's `cell:` image is drawn element-scoped
                // like a repeat cell's, so its src/data exclusivity is
                // checked the same way.
                Item::Table(table) => {
                    for (ci, column) in table.columns.iter().enumerate() {
                        if let Some(cell) = &column.cell {
                            push_from(
                                &cell.items,
                                &format!("{prefix}[{i}].columns[{ci}].cell.items"),
                                images,
                            );
                        }
                    }
                }
                _ => {}
            }
        }
    }
    let mut images = Vec::new();
    if let Some(header) = &template.sections.header {
        push_from(&header.items, "sections.header.items", &mut images);
    }
    let body_items: &[Item] = match &template.sections.body {
        Body::Flow(flow) => &flow.items,
        Body::Absolute(abs) => &abs.items,
    };
    push_from(body_items, "sections.body.items", &mut images);
    if let Some(footer) = &template.sections.footer {
        push_from(&footer.items, "sections.footer.items", &mut images);
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
            match item {
                Item::Table(table) => tables.push((format!("{prefix}[{i}]"), table)),
                Item::Container(container) => {
                    push_from(&container.items, &format!("{prefix}[{i}].items"), tables);
                }
                // Tables inside a `repeat`/table cell are unsupported
                // (layout warns + skips), so they are not collected here.
                _ => {}
            }
        }
    }
    let mut tables = Vec::new();
    let body_items: &[Item] = match &template.sections.body {
        Body::Flow(flow) => &flow.items,
        Body::Absolute(abs) => &abs.items,
    };
    push_from(body_items, "sections.body.items", &mut tables);
    tables
}
