//! Every layout diagnostic names the item that raised it: the walk
//! stamps its structural path (the box-index grammar) on the way out of
//! each node, so a consumer can jump to the offender. Deliberately
//! cross-cutting — it targets the `Ctx::enter_item`/`leave_item` pair in
//! `engine.rs` rather than one src module.
//!
//! `contexts` covers where a warning can be raised from (flow, nesting,
//! band, cell), `emitters` covers who raises it (free functions, the
//! layout-box crate, the data-binding sites, the document level),
//! `columns` covers a table cell naming its column across the three
//! passes over a row, and `hostile` covers the properties that keep the
//! stamp safe under attacker-sized input.

mod columns;
mod contexts;
mod emitters;
mod hostile;

use crate::common::*;

/// A flow body over `items` (YAML indented to the item level), sized so
/// nothing paginates unless a test asks for it.
pub(super) fn flow_body(items: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
defaults: {{ style: {{ fontFamily: biz-ud-gothic, fontSize: 10 }} }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 300, h: 600 }}
    items:
{items}"#
    )
}

/// Every diagnostic carrying `code`, in emission order.
pub(super) fn by_code<'d>(diags: &'d Diagnostics, code: &str) -> Vec<&'d Diagnostic> {
    diags.iter().filter(|d| d.code == code).collect()
}

/// The one diagnostic carrying `code` — fails loudly when the count is
/// not exactly one, since "which item" is the whole subject here.
pub(super) fn only<'d>(diags: &'d Diagnostics, code: &str) -> &'d Diagnostic {
    let found = by_code(diags, code);
    assert_eq!(found.len(), 1, "expected one `{code}`, got {diags:?}");
    found[0]
}

/// The codes that are DOCUMENT-scope by design: raised before the walk
/// descends into any item, so they have nothing to name. Everything else
/// a layout run reports must be located — `contexts`/`emitters` cover the
/// individual cases; `every_warning_from_the_walk_is_located` sweeps a
/// many-warning document so a NEW emit site outside any item window is
/// caught rather than shipping unlocated.
pub(super) const DOCUMENT_SCOPE: &[&str] = &[
    "page_margin_too_large",
    "orientation_ignored",
    "empty_definitions",
];
