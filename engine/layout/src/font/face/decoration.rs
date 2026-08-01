//! Decoration-line metrics (F2 `textDecoration`): underline and strikeout
//! positions scaled from the face's font tables, with conventional
//! fallbacks and hostile-value clamps.

use super::FontFace;

impl FontFace {
    /// Underline `(offset, thickness)` in pt at `size`. Offset is
    /// baseline-relative, y-up (negative = below the baseline), straight
    /// from the font's post table; a conventional fallback applies when
    /// the table is absent or carries hostile values.
    pub fn underline_metrics(&self, size: f64) -> (f64, f64) {
        scaled_or_fallback(self.underline_units, self.units_per_em, -0.1, size)
    }

    /// Strikeout `(offset, thickness)` in pt at `size`, y-up (positive =
    /// above the baseline), from OS/2 metrics with the same fallback
    /// policy as [`Self::underline_metrics`].
    pub fn strikeout_metrics(&self, size: f64) -> (f64, f64) {
        scaled_or_fallback(self.strikeout_units, self.units_per_em, 0.25, size)
    }
}

/// Scales decoration font units to pt, falling back to `default_offset_em`
/// (in em) + a 0.05em thickness when the table is absent — or when its
/// values are hostile: an offset beyond ±1em or a thickness outside
/// (0, 0.5em] would draw the line somewhere absurd, so fonts with garbage
/// tables get the conventional line instead. Pure so the fallback branches
/// are unit-testable without crafting broken font files.
pub(crate) fn scaled_or_fallback(
    units: Option<(f64, f64)>,
    units_per_em: f64,
    default_offset_em: f64,
    size: f64,
) -> (f64, f64) {
    let fallback = (default_offset_em * size, 0.05 * size);
    let Some((offset_units, thickness_units)) = units else {
        return fallback;
    };
    let offset = offset_units / units_per_em * size;
    let thickness = thickness_units / units_per_em * size;
    if offset.is_finite()
        && offset.abs() <= size
        && thickness.is_finite()
        && thickness > 0.0
        && thickness <= 0.5 * size
    {
        (offset, thickness)
    } else {
        fallback
    }
}
