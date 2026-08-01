//! Dash-pattern derivation for `borderStyle: dashed | dotted`.
//!
//! Layout owns the pattern so the two renderers cannot drift: a keyword
//! plus the side's already-clamped stroke width becomes one concrete
//! on/off pair in pt, and the backends only forward it to their dashing
//! API. Pure so the floor and the keyword table are unit-testable
//! without building a layout.

use crate::tree::Dash;
use shojiku_core::BorderStyleKind;

/// Smallest dash interval layout will emit, in pt (~1/3 of a 1pt hairline
/// at 72dpi). A stroke width near zero would otherwise derive intervals
/// near zero, and both rasterizers walk a dashed path one interval at a
/// time — an attacker-authored `borderWidth: 1e-9` on a full-page box
/// would mean ~10^11 segments. The floor bounds that work to the page
/// perimeter divided by a quarter point.
pub(crate) const DASH_MIN_PT: f64 = 0.25;

/// CSS-conventional multiples of the stroke width: `dashed` paints three
/// widths on, three off; `dotted` one and one (square dots — the tree's
/// strokes use the renderers' default caps for borders).
const DASHED_MULTIPLE: f64 = 3.0;
const DOTTED_MULTIPLE: f64 = 1.0;

/// The dash pattern a border/line style implies at `width` pt, or `None`
/// when the style strokes solid (`solid`/`double` — `double` is drawn as
/// two solid lines elsewhere).
///
/// Both intervals share one multiple, so the painted and skipped runs are
/// equal and the pattern reads the same whichever corner it starts from.
/// A non-finite or non-positive width yields the floor rather than a
/// degenerate pattern: an invalid dash makes tiny-skia drop the whole
/// stroke silently, so the value handed to the renderers is always
/// strictly positive and finite.
pub(crate) fn dash_pattern(style: BorderStyleKind, width: f64) -> Option<Dash> {
    let multiple = match style {
        BorderStyleKind::Solid | BorderStyleKind::Double => return None,
        BorderStyleKind::Dashed => DASHED_MULTIPLE,
        BorderStyleKind::Dotted => DOTTED_MULTIPLE,
    };
    let interval = if width.is_finite() && width > 0.0 {
        (width * multiple).max(DASH_MIN_PT)
    } else {
        DASH_MIN_PT
    };
    Some(Dash {
        on: interval,
        off: interval,
    })
}

#[cfg(test)]
mod tests;
