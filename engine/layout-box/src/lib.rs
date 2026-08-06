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

pub use flex::{
    auto_share, cross_offset, equal_share, grow_shares, main_spacing, resolve_flex_lengths,
    FlexItem,
};
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
    /// The width `%` lengths resolve against, when that is NOT `w`.
    ///
    /// The two are the same almost everywhere, which is why this is an
    /// override rather than a second required field. They come apart for
    /// a `row` flex child with no authored width: `w` is the slot it
    /// FILLS (its share of the row), while CSS resolves its `%` lengths
    /// and `%` margins against the flex container. Writing the container
    /// width into `w` instead would make every unsized child fill the
    /// whole row.
    pub pct_w: Option<f64>,
    /// The OUTER height a child with no authored height takes, if the
    /// parent has one to give.
    ///
    /// The width equivalent needs no field: a `column`'s cross axis is
    /// `stretch`, so an unsized width always fills the slot (`w_or_fill`
    /// reads `w`). Height is handed down only in the two cases the
    /// parent computes it — a `stretch` row's cross size, and a column
    /// child's `flexGrow` share of a definite parent height — so it is
    /// `None` everywhere else.
    ///
    /// It is deliberately NOT `h`. `h` is the `%` base, which every child
    /// needs whether or not it is given a height; writing a child's own
    /// share there would resolve its `%` heights against itself instead
    /// of against the flex container. `pct_w` exists for exactly that
    /// distinction on the width axis, where `w` really is the slot.
    pub fill_h: Option<f64>,
}

impl Basis {
    /// The width `%` resolves against — the override when set, else `w`.
    pub fn pct_base(&self) -> f64 {
        self.pct_w.unwrap_or(self.w)
    }
}
