//! Semantic domain grouping for diagnostics.
//!
//! A [`Category`] is a coarse, human-facing bucket (which part of the
//! pipeline a diagnostic is about) that a GUI can use to filter or style
//! its diagnostics pane. Unlike the [`crate::DiagnosticCode`] it is
//! **re-categorizable**: moving a code to a different category is not a
//! contract break, so the module a diagnostic happens to be emitted from
//! is never folded into the stable `code`.

use serde::{Deserialize, Serialize};

/// The semantic domain a diagnostic belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Category {
    /// A structural parse failure (unknown key, wrong type, bad number).
    Parse,
    /// Binding/params problems: unknown keys, missing values, shape.
    Data,
    /// Style registry, named styles, span-inert style keys.
    Style,
    /// Positioning, sizing, pagination, overflow.
    Layout,
    /// Font resolution and glyph coverage.
    Font,
    /// Image/SVG asset loading and policy.
    Asset,
    /// Number/date/currency formatting degradations.
    Format,
    /// A cap or size bound was exceeded and the input was clamped.
    Limits,
}
