//! The data-binding wire: which params key an item reads, which format
//! variant it displays, and which DATA SCOPE the key is resolved in.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Named binding declarations for the `{name}` interpolations ONE item
/// owns — its `text:`, its `link.url`, and (on a text item) its spans'
/// own `text:` / `link.url`.
///
/// A declared name resolves through its declaration, so an interpolated
/// value gains the option set the bare `{key}` grammar cannot carry: a
/// different (even non-ASCII) params key, a [`BindingScope`], a
/// placeholder, a format. An UNDECLARED name keeps its original meaning
/// — the name is the key, resolved at the ambient scope — so every
/// template authored before this key existed is unaffected.
///
/// Declared names and `data.key` are separate namespaces: a `data:`
/// binding already carries every option and never consults this map.
pub type Bindings = BTreeMap<String, Binding>;

/// Advisory cap on declarations per item. Resolution is a map lookup, so
/// a large map is a bloat signal (usually generated), not a DoS surface;
/// validation warns and every declaration keeps working.
pub const MAX_BINDINGS: usize = 256;

/// A data binding: which params key to read and which format variant to use.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Binding {
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    /// What to draw when the bound value is absent, `null`, or `""` — the
    /// "this field is intentionally blank" signal that lets one template
    /// render both a blank form and a filled one. Drawn verbatim: never
    /// interpolated, never formatted. Overrides the field's own
    /// `placeholder` in definitions; a value that is PRESENT but invalid
    /// still reports `format_error` (a data bug is not a blank field).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    /// Which data scope `key` is resolved against. Unset never
    /// serializes and means [`BindingScope::Element`] — the ambient
    /// scope, which is the bound array element inside a `repeat` cell /
    /// `repeat_flow` card / table `cell:` column and top-level params
    /// everywhere else.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    scope: Option<BindingScope>,
}

impl Binding {
    /// Effective data scope (default [`BindingScope::Element`] — the
    /// ambient one, which is what every template authored before this key
    /// existed expects).
    pub fn scope(&self) -> BindingScope {
        self.scope.unwrap_or_default()
    }
}

/// Which data scope a binding's `key` is resolved against.
///
/// Inside a data-scoped construct (a `repeat` cell, a `repeat_flow` card,
/// a table `cell:` column) every binding reads the BOUND ELEMENT by
/// default, so the sub-template is authored once with no per-instance
/// field renaming. `document` is the explicit escape for a value that
/// belongs to the whole document rather than the element — a store name
/// or a pickup date printed on every ticket.
///
/// Outside such a construct the two are identical, and `document` is
/// deliberately INERT there rather than a diagnostic: a sub-template must
/// compose the same way in and out of a `repeat`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BindingScope {
    /// The ambient scope: the bound array element inside a data-scoped
    /// construct, top-level params everywhere else (the default).
    #[default]
    Element,
    /// Top-level params, even inside a data-scoped construct.
    Document,
}
