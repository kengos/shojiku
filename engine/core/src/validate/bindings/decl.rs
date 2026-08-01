//! Named binding declarations (`bindings:`): does each declaration point
//! at a real key, can its name be referenced, is it actually used, and
//! does it quietly shadow an ambient key of the same name? Also the one
//! place a `{…}` that LOOKS like a key but cannot parse is surfaced.

mod surfaces;

use crate::interpolate::{is_valid_interpolation_name, parse_segments, scan_suspect_keys, Segment};
use crate::template::{Binding, BindingScope, Bindings, Item, MAX_BINDINGS};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};
use std::collections::BTreeSet;

use super::cell::{check_cell_field, CellScope};
use super::{check_scalar_binding, BindingCtx};
use surfaces::{declarations, interpolated_strings, is_entry_scoped};

/// What a declaration is checked against: the whole-template invariants,
/// plus the enclosing data-scoped construct when there is one (a
/// `repeat` cell / `repeat_flow` card / table `cell:` column).
pub(in crate::validate) struct DeclCtx<'a> {
    pub bindings: &'a BindingCtx<'a>,
    pub cell: Option<&'a CellScope<'a>>,
}

/// One item's declarations plus the scope rule its own interpolations
/// follow, bundled so the per-declaration calls stay under clippy's
/// argument threshold.
struct ItemDecls<'a> {
    ctx: &'a DeclCtx<'a>,
    /// `{name}` here reads array elements of the item's own (a `list`),
    /// so an element-scoped declaration is unverifiable at validate time.
    entry_scoped: bool,
}

/// The checks that need NO catalog and no scope: the charset scan, the
/// cap, an unreferenceable name, and a declaration nothing uses.
///
/// Deliberately separate from [`check_item_keys`]: the cell walk only
/// runs when definitions declare the bound array, so anything that rode
/// it would go silent inside a `repeat`/table cell for every template
/// validated WITHOUT definitions — including the `{品名}` mistake this
/// feature exists to surface. These run over every item instead.
pub(in crate::validate) fn check_item_structure(item: &Item, path: &str, diags: &mut Diagnostics) {
    let strings = interpolated_strings(item);
    // Runs on EVERY item: a `{品名}` mistake is precisely the case where
    // no declaration exists yet, so it cannot be gated on one.
    for text in &strings {
        for suspect in scan_suspect_keys(text) {
            diags.push(
                Diagnostic::new(Code::InterpolationKeyCharset)
                    .arg("text", format!("{{{suspect}}}"))
                    .with_path(path.to_string()),
            );
        }
    }
    let Some(decls) = declarations(item) else { return };
    if decls.is_empty() {
        return;
    }
    if decls.len() > MAX_BINDINGS {
        diags.push(
            Diagnostic::new(Code::TooManyBindings)
                .arg("count", decls.len())
                .arg("max", MAX_BINDINGS)
                .with_path(path.to_string()),
        );
    }
    let used = referenced_names(&strings, decls);
    for name in decls.keys() {
        let decl_path = format!("{path}.bindings.{name}");
        if !is_valid_interpolation_name(name) {
            diags.push(
                Diagnostic::new(Code::InvalidBindingName)
                    .arg("name", name.to_string())
                    .with_path(decl_path),
            );
            // "unused" would only repeat that in weaker words.
            continue;
        }
        if !used.contains(name.as_str()) {
            diags.push(
                Diagnostic::new(Code::UnusedBinding)
                    .arg("name", name.to_string())
                    .with_path(decl_path),
            );
        }
    }
}

/// The scope-aware half: where each declaration's `key` is checked, and
/// whether it silently redirects a name that already resolved. Needs the
/// enclosing scope, so it runs from the document walk here and from the
/// cell walk in [`super::cell`] — never both for one item.
pub(in crate::validate) fn check_item_keys(
    item: &Item,
    ctx: &DeclCtx<'_>,
    path: &str,
    diags: &mut Diagnostics,
) {
    let Some(decls) = declarations(item) else { return };
    if decls.is_empty() {
        return;
    }
    let item_decls = ItemDecls {
        ctx,
        entry_scoped: is_entry_scoped(item),
    };
    check_format_overrides(&interpolated_strings(item), decls, &item_decls, path, diags);
    for (name, decl) in decls {
        let decl_path = format!("{path}.bindings.{name}");
        check_decl_key(decl, decl.format.as_deref(), &item_decls, &decl_path, diags);
        // An unreferenceable name is already reported by the structural
        // pass; a non-ASCII one may match a declared non-ASCII key it can
        // never actually shadow, so it is not a shadow either.
        if is_valid_interpolation_name(name) && shadows_ambient_key(name, decl, &item_decls) {
            diags.push(
                Diagnostic::new(Code::BindingShadowsKey)
                    .arg("name", name.to_string())
                    .with_path(decl_path),
            );
        }
    }
}

/// Which declared names the item's own strings reference.
fn referenced_names<'d>(strings: &[&str], decls: &'d Bindings) -> BTreeSet<&'d str> {
    let mut used = BTreeSet::new();
    for text in strings {
        for segment in parse_segments(text) {
            let Segment::Expr { key, .. } = segment else {
                continue;
            };
            if let Some((name, _)) = decls.get_key_value(&key) {
                used.insert(name.as_str());
            }
        }
    }
    used
}

/// Re-runs the key check for each inline `{name:format}` override, which
/// wins over the declaration's own `format`.
///
/// The override is checked at the DECLARATION's path so the key/params
/// diagnostics it necessarily repeats collapse against the declaration's
/// own check in `Diagnostics::dedup`, leaving only the format finding.
fn check_format_overrides(
    strings: &[&str],
    decls: &Bindings,
    item: &ItemDecls<'_>,
    path: &str,
    diags: &mut Diagnostics,
) {
    for text in strings {
        for segment in parse_segments(text) {
            let Segment::Expr {
                key,
                format: Some(format),
            } = segment
            else {
                continue;
            };
            let Some((name, decl)) = decls.get_key_value(&key) else {
                continue;
            };
            let decl_path = format!("{path}.bindings.{name}");
            check_decl_key(decl, Some(&format), item, &decl_path, diags);
        }
    }
}

/// Checks one declaration's `key` (and the format it resolves with) in
/// the scope it actually reads: the array group inside a cell, top-level
/// params otherwise — including a `scope: document` escape out of a cell,
/// which regains the full declared-field / format / params checks.
fn check_decl_key(
    decl: &Binding,
    format: Option<&str>,
    item: &ItemDecls<'_>,
    path: &str,
    diags: &mut Diagnostics,
) {
    let element = decl.scope() == BindingScope::Element;
    if item.entry_scoped && element {
        return;
    }
    match (item.ctx.cell, element) {
        (Some(cell), true) => check_cell_field(&decl.key, cell, path, diags),
        _ => check_scalar_binding(
            item.ctx.bindings,
            &decl.key,
            format,
            decl.placeholder.as_deref(),
            path,
            diags,
        ),
    }
}

/// Whether `{name}` would ALSO have resolved without the declaration —
/// and the declaration sends it somewhere else. A reader cannot otherwise
/// tell which of the two the name means.
///
/// Attaching options to the ambient key (`total: { key: total, format:
/// currency }`) redirects nothing and is silent. The check needs a
/// catalog, so it is skipped when validating without definitions, and it
/// is skipped entirely for entry-scoped items whose ambient keys are the
/// unmodelled fields of an array element.
fn shadows_ambient_key(name: &str, decl: &Binding, item: &ItemDecls<'_>) -> bool {
    if item.entry_scoped {
        return false;
    }
    match item.ctx.cell {
        Some(cell) => {
            let ambient = cell.catalog.array_field(cell.array_key, name).is_some()
                || cell.catalog.row_array(cell.array_key, name);
            ambient && (decl.key != name || decl.scope() == BindingScope::Document)
        }
        // `scope:` is inert outside a data-scoped construct, so only a
        // different key redirects here.
        None => {
            let Some(catalog) = item.ctx.bindings.catalog else {
                return false;
            };
            catalog.scalar(name).is_some() && decl.key != name
        }
    }
}

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
        if let Item::Container(container) = item {
            walk_keys(&container.items, ctx, &format!("{path}.items"), diags);
        }
    }
}
