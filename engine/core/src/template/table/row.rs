//! Body-row sizing and styling: the base/zebra layers and the per-row
//! conditional layers a row's own data selects.
//!
//! A conditional entry pairs a declarative predicate (`when:`) with the
//! style layers it applies. The predicate is the SAME `{ key, equals? }`
//! vocabulary form marks bind with ([`MarkBinding`]), so the wire grows no
//! second predicate grammar: a row-relative key, an optional type-strict
//! `equals` (array values match by contains), and no `equals` at all
//! reading the value as a boolean.

use crate::length::Length;
use crate::style::Style;
use serde::{Deserialize, Serialize};

use super::super::MarkBinding;

/// Cap on `row.conditionalStyles` entries; extras are ignored and validate
/// warns. Every body row evaluates every entry, so this bounds the
/// per-render predicate work independently of how long the bound array is.
pub const MAX_ROW_CONDITIONAL_STYLES: usize = 16;

/// Body-row sizing and styling. `height` fixes every row (making the
/// column `textOverflow` policies meaningful); otherwise rows grow to
/// their content with `minHeight` as the floor. `style` fills/styles
/// every body row; `alternateStyle` overlays the even rows (2nd, 4th, …
/// — the CSS `nth-child(even)` analog) for zebra striping; and
/// `conditionalStyles` overlays the rows whose own data matches, on top
/// of both.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RowSpec {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_height: Option<Length>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<Length>,
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
    #[serde(
        rename = "alternateStyleNames",
        default,
        skip_serializing_if = "Vec::is_empty"
    )]
    pub alternate_style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub alternate_style: Style,
    /// Data-driven row layers, applied in listed order after the base and
    /// zebra layers (so a later entry — and any entry — wins over zebra).
    /// Capped by [`MAX_ROW_CONDITIONAL_STYLES`].
    #[serde(
        rename = "conditionalStyles",
        default,
        skip_serializing_if = "Vec::is_empty"
    )]
    pub conditional_styles: Vec<RowConditionalStyle>,
}

impl RowSpec {
    /// Effective `minHeight` (default 24pt).
    pub fn min_height(&self) -> Length {
        self.min_height.unwrap_or(Length::Pt(24.0))
    }

    /// Whether the author wrote nothing — skipped on serialization so a
    /// table without a `row:` round-trips without one.
    pub fn is_empty(&self) -> bool {
        *self == RowSpec::default()
    }
}

/// One conditional row layer: the rows whose element matches `when` get
/// these style layers (named styles in listed order, then the inline
/// `style`) over the base/zebra row style.
///
/// `when` reads a key **relative to the row element**, exactly like a
/// column's `data:` binding — so a table over `order_items` addresses the
/// element's own `kind`, not a document-level key.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RowConditionalStyle {
    /// The predicate against this row's element.
    pub when: MarkBinding,
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
}
