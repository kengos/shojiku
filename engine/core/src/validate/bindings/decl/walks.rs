//! The two walks over a section's items that drive the declaration
//! checks — kept beside them rather than inside, so the checks and the
//! traversal that feeds them stay separately readable.

use crate::template::Item;
use shojiku_diagnostics::Diagnostics;

use super::super::BindingCtx;
use super::{check_item_keys, check_item_structure, DeclCtx};

/// Entry point from [`crate::validate`]: two walks over the section's
/// items.
///
/// The STRUCTURAL walk reaches every item the template holds, cell
/// contents included, because its checks need no catalog — riding the
/// cell walk instead would silence them for any template validated
/// without definitions. The SCOPED walk stops at containers; cell
/// contents reach [`check_item_keys`] through [`super::cell`], where the
/// array scope is known.
pub(in crate::validate) fn check_declarations(
    items: &[Item],
    bindings: &BindingCtx<'_>,
    prefix: &str,
    diags: &mut Diagnostics,
) {
    walk_structure(items, prefix, diags);
    let ctx = DeclCtx {
        bindings,
        cell: None,
    };
    walk_keys(items, &ctx, prefix, diags);
}

/// Every item, descending through each construct that nests one. Paths
/// mirror the walks that own those constructs, so a reader sees the same
/// address the key checks report.
fn walk_structure(items: &[Item], prefix: &str, diags: &mut Diagnostics) {
    for (i, item) in items.iter().enumerate() {
        let path = format!("{prefix}[{i}]");
        check_item_structure(item, &path, diags);
        match item {
            Item::Container(container) => {
                walk_structure(&container.items, &format!("{path}.items"), diags);
            }
            Item::Repeat(repeat) => {
                walk_structure(&repeat.cell.items, &format!("{path}.cell.items"), diags);
            }
            Item::RepeatFlow(rf) => {
                walk_structure(&rf.item.items, &format!("{path}.item.items"), diags);
            }
            Item::Table(table) => {
                for (ci, column) in table.columns.iter().enumerate() {
                    let Some(cell) = &column.cell else { continue };
                    let cell_path = format!("{path}.columns[{ci}].cell.items");
                    walk_structure(&cell.items, &cell_path, diags);
                }
            }
            _ => {}
        }
    }
}

fn walk_keys(items: &[Item], ctx: &DeclCtx<'_>, prefix: &str, diags: &mut Diagnostics) {
    for (i, item) in items.iter().enumerate() {
        let path = format!("{prefix}[{i}]");
        check_item_keys(item, ctx, &path, diags);
        match item {
            Item::Container(container) => {
                walk_keys(&container.items, ctx, &format!("{path}.items"), diags);
            }
            // A list's own keys read array ELEMENTS, so they are checked
            // against the element scope rather than this one.
            Item::List(list) => {
                super::super::entry::check_list_source(list, ctx, &path, diags);
                super::super::entry::check_list_entries(list, ctx, &path, diags);
            }
            _ => {}
        }
    }
}
