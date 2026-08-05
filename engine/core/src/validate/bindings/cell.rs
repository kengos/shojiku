//! Array-scoped binding checks for `repeat` cell / `repeat_flow` card /
//! table `cell:` column contents: every `data:` key and `{{key}}` segment
//! must be a declared field of the bound array group (table-column style)
//! — unless the binding authors `scope: document`, which is checked
//! against the top-level scalars instead.

use crate::catalog::Catalog;
use crate::interpolate::{parse_segments, Segment};
use crate::template::{Binding, BindingScope, Bindings, Item, Link};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics, Echo};

use super::decl::{check_item_keys, DeclCtx};
use super::{check_scalar_binding, BindingCtx};

/// What a cell's bindings are checked against: the array group they are
/// element-scoped to, plus the whole-template invariants a
/// `scope: document` escape needs (bundled so the per-binding call stays
/// under clippy's argument threshold).
pub(in crate::validate) struct CellScope<'a> {
    pub array_key: &'a str,
    pub catalog: &'a Catalog,
    pub bindings: &'a BindingCtx<'a>,
}

/// A `link.url` binds exactly like static cell content.
fn url_of(link: Option<&Link>) -> Option<&str> {
    link.map(|link| link.url.as_str())
}

/// Checks every `{key}` segment of a cell item's static content against
/// the bound array element, SKIPPING names the item declares under
/// `bindings:` — a declared name carries its own key and scope (including
/// the `scope: document` escape a bare `{key}` cannot express) and is
/// checked once at its declaration, in [`super::decl`].
fn check_cell_text(
    content: Option<&str>,
    decls: &Bindings,
    cell: &CellScope<'_>,
    path: &str,
    d: &mut Diagnostics,
) {
    let Some(content) = content else { return };
    for segment in parse_segments(content) {
        if let Segment::Expr { key, .. } = segment {
            if decls.contains_key(&key) {
                continue;
            }
            check_cell_field(&key, cell, path, d);
        }
    }
}

/// Checks one cell `data:` binding, routing by its scope: the default
/// element scope checks the array group, `scope: document` runs the same
/// top-level scalar check a binding outside any cell gets (declared field,
/// format variant, params presence).
fn check_cell_binding(
    binding: &Binding,
    cell: &CellScope<'_>,
    path: &str,
    diags: &mut Diagnostics,
) {
    match binding.scope() {
        BindingScope::Document => check_scalar_binding(
            cell.bindings,
            &binding.key,
            binding.format.as_deref(),
            binding.placeholder.as_deref(),
            path,
            diags,
        ),
        BindingScope::Element => check_cell_field(&binding.key, cell, path, diags),
    }
}

/// Recursively checks a cell's bindings against the bound array group
/// (like table columns): every element-scoped `data:` key and every
/// `{{key}}` in static text must be a declared field of the group.
/// Recurses into containers inside the cell; unsupported cell content
/// (tables, page numbers, nested repeats) is skipped, matching layout.
pub(in crate::validate) fn check_cell_bindings(
    items: &[Item],
    cell: &CellScope<'_>,
    prefix: &str,
    diags: &mut Diagnostics,
) {
    let decl_ctx = DeclCtx {
        bindings: cell.bindings,
        cell: Some(cell),
    };
    for (i, item) in items.iter().enumerate() {
        let path = format!("{prefix}[{i}]");
        // Only the scope-aware half: the structural checks already ran
        // over every item in `decl::walk_structure`, which is not gated
        // on definitions the way this walk is.
        check_item_keys(item, &decl_ctx, &path, diags);
        match item {
            Item::Text(text) => {
                if let Some(binding) = &text.data {
                    check_cell_binding(binding, cell, &path, diags);
                }
                let decls = &text.bindings;
                check_cell_text(text.text.as_deref(), decls, cell, &path, diags);
                check_cell_text(url_of(text.link.as_ref()), decls, cell, &path, diags);
                // Rich spans bind like the item itself: per-span `data`
                // keys carry their own scope, `{key}` interpolations stay
                // element-scoped and read the OWNING item's declarations.
                for (si, span) in text.spans.iter().enumerate() {
                    let span_path = format!("{path}.spans[{si}]");
                    if let Some(binding) = &span.data {
                        check_cell_binding(binding, cell, &span_path, diags);
                    }
                    check_cell_text(span.text.as_deref(), decls, cell, &span_path, diags);
                    check_cell_text(url_of(span.link.as_ref()), decls, cell, &span_path, diags);
                }
            }
            Item::Image(image) => {
                // A `data:`-bound cell image is element-scoped like text
                // unless it escapes to the document. Image bindings have
                // no format variants and nothing to draw for a
                // placeholder, so neither is passed on.
                if let Some(binding) = &image.data {
                    match binding.scope() {
                        BindingScope::Document => check_scalar_binding(
                            cell.bindings,
                            &binding.key,
                            None,
                            None,
                            &path,
                            diags,
                        ),
                        BindingScope::Element => check_cell_field(&binding.key, cell, &path, diags),
                    }
                }
                check_cell_text(
                    url_of(image.link.as_ref()),
                    &image.bindings,
                    cell,
                    &path,
                    diags,
                );
            }
            Item::QrCode(qr) => {
                if let Some(binding) = &qr.data {
                    check_cell_binding(binding, cell, &path, diags);
                }
                check_cell_text(qr.text.as_deref(), &qr.bindings, cell, &path, diags);
            }
            Item::CharGrid(grid) => {
                // Binds element-scoped like text/qr content (the
                // per-element kanji-drill case).
                if let Some(binding) = &grid.data {
                    check_cell_binding(binding, cell, &path, diags);
                }
                check_cell_text(grid.text.as_deref(), &grid.bindings, cell, &path, diags);
            }
            Item::List(list) => {
                // The list's array must be a declared field of the group
                // (or, escaped, a top-level key); its per-entry template
                // resolves one level further in, against the ELEMENTS of
                // that array — see `super::entry`.
                super::entry::check_list_source(list, &decl_ctx, &path, diags);
                super::entry::check_list_entries(list, &decl_ctx, &path, diags);
            }
            Item::Container(container) => {
                check_cell_bindings(&container.items, cell, &format!("{path}.items"), diags);
            }
            _ => {}
        }
    }
}

/// Flags a single cell binding key that is not a declared field of the
/// array group it is scoped to.
pub(super) fn check_cell_field(
    field: &str,
    cell: &CellScope<'_>,
    path: &str,
    diags: &mut Diagnostics,
) {
    let (array_key, catalog) = (cell.array_key, cell.catalog);
    if catalog.array_field(array_key, field).is_none() && !catalog.row_array(array_key, field) {
        diags.push(
            Diagnostic::new(Code::UnknownDataKey)
                .arg("key", field)
                .arg(
                    "source",
                    format!("array group `{}`", Echo::inline(array_key)),
                )
                .with_path(path.to_string()),
        );
    }
}
