//! The engine-supplied leaves: items whose content the ENGINE fills in
//! rather than the author drawing it — a QR encoded at layout time, a list
//! expanded from an array, the page number the paginator counts, and the
//! explicit break that drives it.
//!
//! Split out of [`super`] so both files stay inside the line budget; the
//! wire is unchanged and [`super`] re-exports every type here.

use crate::geometry::OptBox;
use crate::style::Style;
use crate::template::binding::{Binding, Bindings};
use crate::template::visibility::VisibleBinding;
use serde::{Deserialize, Serialize};

/// A QR code item. Content comes from `text` (static, with
/// `{key}` interpolation) or `data` (single bound value) — exactly like
/// a text item; the engine encodes whatever string it is given (URL /
/// number / opaque token — no semantics). Encoded at *layout* time into
/// vector module rects, so it needs no asset pipeline and works inside
/// `repeat` cells with element-scoped bindings. `box.w`/`box.h` are
/// required; the code is drawn square (the smaller side) with the
/// spec's 4-module quiet zone inside.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QrCodeItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// Params-conditional presence; unset draws unconditionally.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible: Option<VisibleBinding>,
    #[serde(rename = "box", default, skip_serializing_if = "Option::is_none")]
    pub box_: Option<OptBox>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Binding>,
    /// Declarations for this item's `{name}` interpolations — see
    /// [`Bindings`]. Bounded by [`crate::template::binding::MAX_BINDINGS`].
    #[serde(default, skip_serializing_if = "Bindings::is_empty")]
    pub bindings: Bindings,
    /// QR error-correction level (default `medium`). Higher levels
    /// tolerate more damage but need more modules for the same content.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    error_correction: Option<EcLevel>,
    /// Named styles, decoration only (`backgroundColor` under the code —
    /// the usual white backing — and `borderWidth`/`borderColor`).
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
}

/// QR error-correction level (ISO 18004): tolerated damage ~7/15/25/30%.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "lowercase")]
pub enum EcLevel {
    Low,
    #[default]
    Medium,
    Quartile,
    High,
}

/// A bounded per-element list: renders an array field one entry per
/// line, clamping at the last fitting entry and ending with an overflow
/// line when entries were cut. No pagination — inside a `repeat` cell the
/// box is a fixed slot; in a flow an auto-height list simply grows.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// Params-conditional presence; unset draws unconditionally.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible: Option<VisibleBinding>,
    #[serde(rename = "box", default, skip_serializing_if = "Option::is_none")]
    pub box_: Option<OptBox>,
    /// The array to render: a params key, or inside a `repeat` cell a
    /// field of the bound element.
    pub data: Binding,
    /// Per-entry template with `{key}` interpolation against the entry
    /// object. Unset: scalar entries print directly (strings as-is,
    /// numbers in plain form — no locale formatting).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Declarations for the `{name}` interpolations in this item's
    /// per-entry `text` — see [`Bindings`]. A declaration resolves against
    /// the ENTRY like the entry template itself does, unless it authors
    /// `scope: document`. Bounded by [`crate::template::binding::MAX_BINDINGS`].
    #[serde(default, skip_serializing_if = "Bindings::is_empty")]
    pub bindings: Bindings,
    /// Template for the trailing overflow line; `{count}` is replaced
    /// with the number of entries that did NOT fit (e.g. `他{count}件`).
    /// Default `+{count}`. Same token convention as `page_number`'s
    /// `format`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub overflow_text: Option<String>,
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
}

/// An explicit page break: the next flow item starts on a fresh
/// page. Flow-only (bands/absolute bodies/containers/cells warn+skip);
/// a break at the top of an untouched page is a no-op, so consecutive
/// breaks collapse to one — blank pages are never generated.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct PageBreakItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// Params-conditional presence; unset draws unconditionally.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible: Option<VisibleBinding>,
}

/// A page number item; only valid in header/footer bands.
/// `format` supports `{page}` and `{pages}` tokens.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct PageNumberItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// Params-conditional presence; unset draws unconditionally.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible: Option<VisibleBinding>,
    #[serde(rename = "box", default, skip_serializing_if = "Option::is_none")]
    pub box_: Option<OptBox>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    format: Option<String>,
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
}

impl PageNumberItem {
    /// Effective format template (default `{page} / {pages}`).
    pub fn format(&self) -> &str {
        self.format.as_deref().unwrap_or("{page} / {pages}")
    }
}

impl QrCodeItem {
    /// Effective error-correction level (default `medium`).
    pub fn error_correction(&self) -> EcLevel {
        self.error_correction.unwrap_or_default()
    }
}
