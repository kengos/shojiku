//! Vertical band metrics (cap height, descent): the baseline-relative
//! extents form marks center on and the `inspect` text-metrics surface
//! exposes, with conventional fallbacks and hostile-value clamps for
//! faces whose OS/2 table is absent or garbage.

use skrifa::raw::TableProvider;
use skrifa::{FontRef, MetadataProvider};

use super::FontFace;

/// Conventional cap-height ratio (of em) for faces that omit `sCapHeight`
/// — a CJK-typical value; Latin caps commonly sit near 0.7em.
const CAP_FALLBACK_EM: f64 = 0.72;
/// Conventional descent ratio (of em) for a hostile/absent descent.
const DESCENT_FALLBACK_EM: f64 = 0.22;

impl FontFace {
    /// Full-em vertical advance in pt at `size` — the distance one upright
    /// glyph occupies down a vertical line. Mirrors harfrust's
    /// vertical-advance fallback (`ascent − descent`) for a face without a
    /// `vmtx` table, so the wrap estimate agrees with a shaped measure; a
    /// hostile or degenerate span degrades to 1em (`size`).
    pub fn vertical_advance(&self, size: f64) -> f64 {
        vadvance_or_fallback(
            self.ascent_units,
            self.descent_units,
            self.units_per_em,
            size,
        )
    }
}

/// A scaled `vmtx` advance in pt, or `None` when the value is hostile:
/// non-finite, non-positive, or over 2em (the same broken-table ceiling
/// [`vadvance_or_fallback`] uses — a u16 advance over a tiny upem scales
/// absurdly). Pure so the guard branches are unit-testable without
/// crafting broken font files.
pub(in crate::font) fn vmtx_or_none(units: f64, units_per_em: f64, size: f64) -> Option<f64> {
    let adv = units / units_per_em * size;
    (adv.is_finite() && adv > 0.0 && adv <= 2.0 * size).then_some(adv)
}

/// Vertical advance in pt: `(ascent − descent) / upem × size`, falling
/// back to 1em (`size`) when the result is non-finite or outside
/// `(0, 2em]` (a line span deeper than two ems is a broken table).
/// `descent_units` is skrifa's signed (usually negative) value, so
/// subtracting it adds the descender depth. Pure so both branches are
/// unit-testable without crafting broken font files.
pub(in crate::font) fn vadvance_or_fallback(
    ascent_units: f64,
    descent_units: f64,
    units_per_em: f64,
    size: f64,
) -> f64 {
    let span = (ascent_units - descent_units) / units_per_em * size;
    if span.is_finite() && span > 0.0 && span <= 2.0 * size {
        span
    } else {
        size
    }
}

impl FontFace {
    /// Per-char vertical advance in pt at `size`: the font's real `vmtx`
    /// advance for the char's glyph when the table carries a sane value,
    /// else the [`Self::vertical_advance`] fallback. The wrap estimate's
    /// upright basis — the same `vmtx` data harfrust's shaped column
    /// advances by, so estimate and draw agree on fonts that have one.
    pub fn vertical_char_advance(&self, c: char, size: f64) -> f64 {
        self.vmtx_advance(c, size)
            .unwrap_or_else(|| self.vertical_advance(size))
    }

    /// Raw `vmtx` advance for `c` in pt, if the face has the table, maps
    /// the char, and the scaled value survives the hostile-range guard.
    fn vmtx_advance(&self, c: char, size: f64) -> Option<f64> {
        // Re-parsing walks bytes `from_bytes` already validated; `.ok()?`
        // keeps the impossible branch on an always-executed line.
        let font = FontRef::from_index(&self.data, 0).ok()?;
        let glyph = font.charmap().map(c)?;
        let units = font.vmtx().ok()?.advance(glyph)?;
        vmtx_or_none(f64::from(units), self.units_per_em, size)
    }

    /// Baseline-to-cap-top distance in pt at `size` — the top of the
    /// optical band a circled-text overlay or a cap-height checkbox frame keys
    /// off. Falls back to a conventional ratio when the face omits
    /// `sCapHeight` or reports a hostile value.
    pub fn cap_height(&self, size: f64) -> f64 {
        cap_or_fallback(self.cap_height_units, self.units_per_em, size)
    }

    /// Downward baseline-to-descender distance in pt at `size` (always
    /// non-negative). skrifa reports descent as a signed (usually
    /// negative) value; the magnitude is taken, with a conventional
    /// fallback for a non-finite or absurd table value.
    pub fn descent(&self, size: f64) -> f64 {
        descent_or_fallback(self.descent_units, self.units_per_em, size)
    }
}

/// Downward descent magnitude in pt, falling back to
/// [`DESCENT_FALLBACK_EM`] × size when the scaled magnitude is non-finite
/// or exceeds 1em (a descender deeper than the em is a broken table).
/// Pure so both branches are unit-testable.
pub(in crate::font) fn descent_or_fallback(units: f64, units_per_em: f64, size: f64) -> f64 {
    let mag = (units / units_per_em * size).abs();
    if mag.is_finite() && mag <= size {
        mag
    } else {
        DESCENT_FALLBACK_EM * size
    }
}

/// Scales a cap-height font value to pt, falling back to
/// [`CAP_FALLBACK_EM`] × size when absent — or when the scaled value is
/// non-finite or outside `(0, 1.2em]` (a cap taller than 1.2em is a
/// broken table). Pure so the fallback branches are unit-testable without
/// crafting broken font files.
pub(in crate::font) fn cap_or_fallback(
    cap_units: Option<f64>,
    units_per_em: f64,
    size: f64,
) -> f64 {
    let fallback = CAP_FALLBACK_EM * size;
    let Some(units) = cap_units else {
        return fallback;
    };
    let cap = units / units_per_em * size;
    if cap.is_finite() && cap > 0.0 && cap <= 1.2 * size {
        cap
    } else {
        fallback
    }
}

#[cfg(test)]
mod tests;
