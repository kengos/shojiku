//! Params-conditional visibility: the `visible:` key every item carries.
//!
//! The presence binding form marks already use, generalized to the whole
//! item vocabulary — same `{ key, equals?, scope? }` vocabulary, same
//! truth table, no second grammar. What is new is `collapse:`, which
//! chooses between the two CSS analogs:
//!
//! - unset (the default) is CSS `visibility: hidden` (CSS 2.1 §11.2) —
//!   the box is still generated and still reserves its space; nothing is
//!   painted. This is the form-mark posture: a blank↔filled params pair
//!   never shifts layout by a point.
//! - `collapse: true` is CSS `display: none` (CSS Display 3 §2.5) — the
//!   item generates no box at all and its siblings close up over it,
//!   gaps included.
//!
//! Neither is inherited in the CSS sense, and that costs nothing: a
//! `visible:` binding has no "force-visible" spelling, so CSS's
//! `visibility: visible` escape hatch has no authorable form. A hidden
//! item therefore hides its whole subtree, which is byte-identical to
//! what the inherited rule would produce for every document the wire can
//! express.

use serde::{Deserialize, Serialize};

use super::binding::BindingScope;
use super::marks::EqualsValue;

/// Whether an item is drawn, bound to params.
///
/// `key` reads a value (scoped to the enclosing `repeat` element unless
/// `scope: document`). With `equals` the item shows when the value equals
/// it (or, for an array value, contains it — multi-select); without
/// `equals` the value is read as a boolean and the item shows when it is
/// `true`. A value the predicate cannot use warns and the item does not
/// show, exactly as a form mark's `data:` behaves.
///
/// The three shared fields are re-declared rather than
/// `#[serde(flatten)]`-ed onto [`MarkBinding`](super::MarkBinding):
/// `flatten` silently disables `deny_unknown_fields`, which would let a
/// misspelled `visble:` through as an accepted unknown key. The
/// *predicate* is what the two surfaces share, not the struct.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct VisibleBinding {
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub equals: Option<EqualsValue>,
    /// Which data scope `key` is resolved against — the same escape a
    /// text [`Binding`](super::Binding) takes, so a page-global flag can
    /// hide an item inside every `repeat` element.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    scope: Option<BindingScope>,
    /// Take the item out of layout entirely when it does not show,
    /// instead of reserving its box.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    collapse: Option<bool>,
}

impl VisibleBinding {
    /// Effective data scope (default [`BindingScope::Element`], the
    /// ambient one).
    pub fn scope(&self) -> BindingScope {
        self.scope.unwrap_or_default()
    }

    /// Whether a non-showing item is removed from layout (`display:
    /// none`) rather than merely unpainted (`visibility: hidden`).
    pub fn collapse(&self) -> bool {
        self.collapse.unwrap_or(false)
    }
}

#[cfg(test)]
mod tests;
