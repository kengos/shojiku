//! Form marks: box-inscribed `ellipse` (circled-text / decoration) and
//! `checkbox` (an always-drawn frame with a params-driven check). Both
//! render as vector paths, never font glyphs, so determinism never hangs
//! on font coverage. A mark's *presence* is content: `data:` binds it to
//! params via a [`MarkBinding`], while its geometry stays template-fixed
//! (the blank↔filled one-template workflow — an unmatched mark still
//! occupies its box, so layout never shifts between params sets).

use crate::geometry::OptBox;
use crate::length::Length;
use crate::style::Style;
use serde::de::{self, Deserializer};
use serde::{Deserialize, Serialize};

use super::binding::BindingScope;
use super::visibility::VisibleBinding;

/// A box-inscribed ellipse. With no `data:` it always draws (decoration —
/// e.g. a stroked oval circling the chosen payment method on a form); with `data:`
/// it draws only when the binding matches (see [`MarkBinding`]). Styled
/// with the unified [`Style`] (`backgroundColor` fills, `borderWidth`/
/// `borderColor` stroke — uniform only, a per-side map warns); when no
/// layer authors a width the outline defaults to 1pt black (a mark's
/// visible geometry is its function).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct EllipseItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// Params-conditional presence; unset draws unconditionally.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible: Option<VisibleBinding>,
    /// Optional since an anchored ellipse takes its geometry from the
    /// item it circles; unanchored and unsized still warns
    /// (`mark_missing_size`) rather than guessing a size.
    #[serde(rename = "box", default, skip_serializing_if = "Option::is_none")]
    pub box_: Option<OptBox>,
    /// Circles another item instead of standing on its own coordinates:
    /// the ellipse CENTRES on that item's glyph band (its text metrics —
    /// the inked band, not the padded box), or on its border box when it
    /// has no text. `box.w`/`box.h` still size it; unsized, it takes the
    /// band's own extent, which is the "circle this answer" case forms
    /// are full of. `box.x`/`box.y` are not read — the anchor decides
    /// where it sits.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor: Option<String>,
    /// Presence binding; `None` = always draw.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<MarkBinding>,
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
}

/// A checkbox: the frame (a stroked box) is chrome and always draws; the
/// check mark is content, drawn only when `checked` is set or `data:`
/// matches. An empty box is the blank-form state. `checked` and `data:`
/// are mutually exclusive (validation warns; `data:` wins).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct CheckboxItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// Params-conditional presence; unset draws unconditionally.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible: Option<VisibleBinding>,
    /// Frame box; may be omitted entirely — the frame then defaults to the
    /// inherited font's cap-height square (a label-matched checkbox). An
    /// omitted `w`/`h` inside a present `box:` (e.g. for placement) falls
    /// back the same way.
    #[serde(rename = "box", default, skip_serializing_if = "Option::is_none")]
    pub box_: Option<OptBox>,
    /// Static check state; drawn when `Some(true)`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checked: Option<bool>,
    /// Params-driven check state; `None` = fall back to `checked`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<MarkBinding>,
    /// Frame style (unified [`Style`]; `borderColor` also colors the
    /// check mark; the frame defaults to 1pt when no layer authors a
    /// width — an empty box is the blank-form state, so it must print).
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
}

/// A text-anchored circled-text: an oval overlay that auto-centers on the host
/// text item's glyph band, so the author never hand-measures the offset a
/// font change would invalidate. With no `data:` it always draws
/// (decoration); with `data:` it draws only when the binding matches
/// (like a standalone [`EllipseItem`]), and either way the overlay is
/// paint-only — it never changes the text's reserved box, so a
/// blank↔filled params pair never shifts layout. `padding` overrides the
/// default optical clearance (an em-proportional overshoot) between the
/// glyph band and the oval; the style is the unified [`Style`] (uniform
/// border + `backgroundColor` fill, 1pt outline default like `ellipse`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct TextMark {
    /// Presence binding; `None` = always draw.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<MarkBinding>,
    /// Optical clearance added around the glyph band; unset = the
    /// em-proportional default (with the perceptual overshoot baked in).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub padding: Option<Length>,
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
}

/// How a mark's presence binds to params. `key` reads a value (scoped to
/// the enclosing `repeat` element, else top-level params). With `equals`
/// the mark draws when the value equals it (or, for an array value,
/// contains it — multi-select); without `equals` the value is read as a
/// boolean and the mark draws when it is `true`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct MarkBinding {
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub equals: Option<EqualsValue>,
    /// Which data scope `key` is resolved against — the same escape a
    /// text [`Binding`](super::Binding) takes, so a page-global flag can
    /// tick a checkbox inside every cell.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    scope: Option<BindingScope>,
}

impl MarkBinding {
    /// Effective data scope (default [`BindingScope::Element`], the
    /// ambient one).
    pub fn scope(&self) -> BindingScope {
        self.scope.unwrap_or_default()
    }
}

/// The value an `equals` predicate compares against: a string, number, or
/// boolean scalar. Maps and sequences are parse errors (an explicit
/// `equals: null` is standard-serde `None` — i.e. no predicate). Kept as a
/// [`serde_json::Value`] so comparison against a params value is a direct,
/// type-strict equality (`"2"` never equals `2`) and the authored form
/// (integer vs float, quoted vs bare) round-trips unchanged.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct EqualsValue(pub serde_json::Value);

impl<'de> Deserialize<'de> for EqualsValue {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = serde_json::Value::deserialize(deserializer)?;
        match value {
            serde_json::Value::String(_)
            | serde_json::Value::Number(_)
            | serde_json::Value::Bool(_) => Ok(EqualsValue(value)),
            _ => Err(de::Error::custom(
                "`equals` must be a string, number, or boolean",
            )),
        }
    }
}

#[cfg(test)]
mod tests;
