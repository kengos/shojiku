//! Non-cascading paint style for the `line` item — a stroke primitive
//! with no box, so the unified box-decoration [`super::Style`] does not
//! apply (`rect` and the form marks converged onto `Style`; `line` keeps
//! `width`/`color` deliberately). Wire discipline: every field is
//! `Option`+skip so only authored keys serialize (round-trip without
//! injected defaults); effective defaults live in the accessors.

use super::BorderStyleKind;
use serde::{Deserialize, Serialize};

/// Default stroke width for the line item (pt), applied via the accessor.
const DEFAULT_STROKE_PT: f64 = 1.0;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LineStyle {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Paint alpha `0..=1`; unset draws opaque. Clamped (with a warning)
    /// at layout time.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    /// Stroke pattern, sharing the border wire's keyword set: `solid`
    /// (default) | `dashed` | `dotted` | `double`. The cut-here-line staple
    /// is `dashed`; `double` draws two parallel lines a third of the
    /// width each, offset either side of the authored geometry.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<BorderStyleKind>,
}

impl LineStyle {
    /// Effective stroke width (default 1pt).
    pub fn width(&self) -> f64 {
        self.width.unwrap_or(DEFAULT_STROKE_PT)
    }

    /// Effective stroke pattern (default solid).
    pub fn style(&self) -> BorderStyleKind {
        self.style.unwrap_or_default()
    }

    /// Whether every property is authored-unset (skip serialization).
    pub fn is_default(&self) -> bool {
        *self == LineStyle::default()
    }
}
