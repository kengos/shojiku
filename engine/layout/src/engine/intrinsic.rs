//! Max-content (intrinsic) width measurement — the ONE machine two
//! consumers read: the flex row planner's `flexBasis: content` sizing and
//! the grid's `auto` COLUMN tracks.
//!
//! It is deliberately NOT a discarded layout pass. The established
//! measure idiom (`engine::table::rows::cell::measure_cell`) runs a full
//! layout and throws it away, which is fine for one table cell but
//! catastrophic here: a row child that is itself a row container would
//! cost `2^depth` under `MAX_CONTAINER_DEPTH`. So this walk builds no
//! `LayoutItem` and no `PlacedBox`, and never calls `flex_child_atom` —
//! it recurses over the template measuring content only, so a whole
//! layout stays linear in the item count.
//!
//! Not every kind has a width-intrinsic size. `None` means "no defined
//! intrinsic width" and the caller falls back to its share-based
//! behavior; the kinds that return `None` are documented on
//! `docs/engine/flex.md`, not silently guessed.

mod leaf;

use shojiku_core::MAX_CONTAINER_DEPTH;
use shojiku_layout_box::MAX_RESOLVED_PT;

use super::flex::FlexKind;
use super::{Basis, Ctx};

impl<'a, 'b> Ctx<'a, 'b> {
    /// The border-box max-content width of one flex/grid child, or
    /// `None` when the kind has no width-intrinsic size.
    ///
    /// Margins are NOT included — callers add them, exactly as they
    /// already do for a child with an authored `w`. Diagnostics raised
    /// while measuring are parked: the real pass walks the same content
    /// and would otherwise find the once-per-key warning ledgers already
    /// consumed, suppressing the emission that actually reaches the user.
    pub(super) fn max_content_width(
        &mut self,
        kind: &FlexKind,
        basis: &Basis,
        depth: usize,
    ) -> Option<f64> {
        let parked = self.begin_measure();
        let width = self.measure_kind(kind, basis, depth);
        self.end_measure(parked);
        width.map(clamp_measured)
    }

    /// Kind dispatch, under the measure park. Split from the public entry
    /// so every arm shares one park/unpark and one clamp.
    ///
    /// This is where the walk's depth bound lives, because this is where
    /// the recursion goes: `container_max_content` calls back in here for
    /// every child, so a bound on the public entry would be checked once
    /// and never again. `container_atom` checks `MAX_CONTAINER_DEPTH` at
    /// LAYOUT time, which is too late for a measurement that runs BEFORE
    /// any child is placed — the deep subtree is refused, but only after
    /// this walk has already descended it.
    fn measure_kind(&mut self, kind: &FlexKind, basis: &Basis, depth: usize) -> Option<f64> {
        if depth > MAX_CONTAINER_DEPTH {
            return None;
        }
        match kind {
            FlexKind::Text(t) => self.text_max_content(t),
            FlexKind::Container(c) => self.container_max_content(c, basis, depth),
            // A checkbox auto-sizes to the inherited cap-height square —
            // the same square `plan_row` already reserves for it, so its
            // basis and its drawn size agree by construction.
            FlexKind::Checkbox(_) => Some(self.inherited_cap_square()),
            // The remaining kinds have no intrinsic width HERE, for two
            // different reasons, both documented on docs/engine/flex.md:
            //
            // `rect`, `ellipse`, `image` and `qr_code` REQUIRE an authored
            // `w`/`h` (`rect_missing_size` / `image_missing_size` /
            // `qr_missing_size`), so an unsized one never lays out at all
            // — there is no unsized case for a basis to size.
            //
            // `list` and `char_grid` fill their slot and could be
            // measured, but their content walks resolve through the data
            // scope; `table` resolves its columns as `%` of the region it
            // is placed in, which is what this measurement is producing.
            FlexKind::Rect(_)
            | FlexKind::Ellipse(_)
            | FlexKind::Image(_)
            | FlexKind::QrCode(_)
            | FlexKind::List(_)
            | FlexKind::CharGrid(_)
            | FlexKind::Table(_) => None,
        }
    }
}

/// Bounds a measured width to the resolve cap.
///
/// Max-content is the one measurement with no container to bound it: it
/// shapes the WHOLE of a params-driven string where the real pass only
/// ever shapes what fits on a line. Clamping here is what keeps a
/// hostile value from reaching the track/share arithmetic as `inf`, and
/// a non-finite measurement collapses to 0 rather than poisoning every
/// sum it takes part in.
pub(super) fn clamp_measured(w: f64) -> f64 {
    if w.is_finite() {
        w.clamp(0.0, MAX_RESOLVED_PT)
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests;
