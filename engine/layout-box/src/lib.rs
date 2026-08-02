//! Box-model math for the layout pass: the positioning bases, guarded
//! length/edge resolution, and the resolved CSS box.
//!
//! This crate is the *pure geometry* half of layout — no fonts, params,
//! or assets. `shojiku-layout` measures content and walks the template;
//! this crate turns box specs (plus already-measured sizes) into
//! rectangles, with the hostile-input caps applied in exactly one place.
//! Box-model Phase 2 (flex) and Phase 3 (grid) land their distribution
//! algorithms here, where they stay unit-testable with plain numbers.
//! Wire types (`OptBox`, `EdgeSpec`, `Length`) live in `shojiku-core`;
//! this crate only resolves them.

mod flex;
mod grid;
mod resolve;
mod resolved;

pub use flex::{auto_share, cross_offset, equal_share, grow_shares, main_spacing};
pub use grid::{equal_track, track_offsets};
pub use resolve::{clamp_size, resolve_edges, resolve_x, resolve_y, MAX_RESOLVED_PT};
pub use resolved::ResolvedBox;

/// The parent box lengths resolve against: an x origin plus the `%` and
/// font-relative bases. The width basis is always definite; the height
/// basis is `None` while a container's auto height is still being
/// computed. `font` carries the `em`/`rem` bases (U1) — the constructor
/// picks `em` from the style cascade in effect, so derived bases copy it.
#[derive(Clone, Copy, Debug)]
pub struct Basis {
    pub x: f64,
    pub w: f64,
    pub h: Option<f64>,
    pub font: shojiku_core::FontRel,
}
