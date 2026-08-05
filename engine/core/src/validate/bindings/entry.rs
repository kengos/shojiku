//! A `list`'s per-ENTRY scope: its `text:` template and its own
//! `bindings:` declarations resolve against ONE ELEMENT of the array it
//! binds, not against the ambient scope.
//!
//! The element's shape is exactly what definitions declare under the
//! array's `items:` — including for a nested source (a list inside a
//! `repeat` cell), whose fields the catalog registers under the joined
//! dotted path. So these keys are checkable here rather than left to
//! layout's `missing_data`.
//!
//! Silent by construction when the shape is unknown: no definitions, an
//! undeclared source, or an `items:` the schema does not describe. A
//! SCALAR element is not unknown — it has no fields at all, so any
//! `{key}` against it is a real authoring mistake and is reported.

use crate::catalog::ArrayElement;
use crate::interpolate::{parse_segments, Segment};
use crate::template::{BindingScope, ListItem};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};

use super::cell::{check_cell_field, CellScope};
use super::decl::DeclCtx;

/// Checks the ARRAY a list binds, in the scope it actually reads: a
/// row-relative field of the enclosing group, or — for a
/// `scope: document` list, and for any list outside a cell — a declared
/// top-level SOURCE. The source check is deliberately NOT the scalar
/// one: no array is a scalar field, so routing it there reported every
/// legal top-level array as undeclared.
pub(in crate::validate) fn check_list_source(
    list: &ListItem,
    ctx: &DeclCtx<'_>,
    path: &str,
    diags: &mut Diagnostics,
) {
    let Some(catalog) = ctx.bindings.catalog else {
        return;
    };
    if let (Some(cell), BindingScope::Element) = (ctx.cell, list.data.scope()) {
        check_cell_field(&list.data.key, cell, path, diags);
        return;
    }
    let key = &list.data.key;
    let code = if !catalog.contains(key) {
        Code::UnknownDataKey
    } else if !catalog.is_array(key) {
        Code::NotAnArray
    } else {
        return;
    };
    let diagnostic = Diagnostic::new(code)
        .arg("key", key.as_str())
        .with_path(path.to_string());
    diags.push(match code {
        Code::UnknownDataKey => diagnostic.arg("source", "definitions"),
        _ => diagnostic,
    });
}

/// Checks a list's entry-scoped keys — the `{key}` segments of `text:`
/// (skipping names the list declares, which are checked here too, under
/// their own key) plus every element-scoped `bindings:` declaration.
pub(in crate::validate) fn check_list_entries(
    list: &ListItem,
    ctx: &DeclCtx<'_>,
    path: &str,
    diags: &mut Diagnostics,
) {
    let Some(catalog) = ctx.bindings.catalog else {
        return;
    };
    // `scope: document` reads the top-level array even from inside a
    // cell, so the row-relative join must not apply to it.
    let scope = match list.data.scope() {
        BindingScope::Document => None,
        BindingScope::Element => ctx.cell.map(|cell| cell.array_key),
    };
    let Some(array_key) = catalog.resolve_array_path(scope, &list.data.key) else {
        return;
    };
    if matches!(
        catalog.array_element(&array_key),
        None | Some(ArrayElement::Undeclared)
    ) {
        return;
    }
    let entry = CellScope {
        array_key: &array_key,
        catalog,
        bindings: ctx.bindings,
    };
    if let Some(text) = list.text.as_deref() {
        for segment in parse_segments(text) {
            let Segment::Expr { key, .. } = segment else {
                continue;
            };
            if list.bindings.contains_key(&key) {
                continue;
            }
            check_cell_field(&key, &entry, path, diags);
        }
    }
    for (name, decl) in &list.bindings {
        if decl.scope() != BindingScope::Element {
            continue;
        }
        // The declaration's own path, as `decl` addresses it — the name is
        // document-declared, so it is bounded where it is composed in.
        let decl_path = format!(
            "{path}.bindings.{}",
            shojiku_diagnostics::Echo::inline(name)
        );
        check_cell_field(&decl.key, &entry, &decl_path, diags);
    }
}
