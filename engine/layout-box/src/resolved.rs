//! [`ResolvedBox`]: one item box (`OptBox`) resolved against its parent
//! — margins, padding, and the border-box position/size, with the
//! content-box helpers every item kind shares.

use crate::resolve::{clamp_size, resolve_edges, resolve_x, resolve_y};
use crate::Basis;
use shojiku_core::OptBox;
use shojiku_diagnostics::Diagnostics;

/// An item's box resolved to pt (border-box sizing). `y` is deliberately
/// absent: vertical placement belongs to the walk (flow cursor, absolute
/// `y`, band offset), not to the box itself.
#[derive(Debug, Clone, Copy)]
pub struct ResolvedBox {
    /// Margins `[top, right, bottom, left]`; may be negative. Sides
    /// authored `auto` resolve to 0 here — their free-space share is
    /// flex placement's job (see [`Self::margin_auto`]).
    pub margin: [f64; 4],
    /// Which margin sides were authored `auto`, same order.
    pub margin_auto: [bool; 4],
    /// Padding `[top, right, bottom, left]`; non-negative by parse.
    pub padding: [f64; 4],
    /// Border-box left edge, absolute (`basis.x` + x offset + left
    /// margin).
    pub x: f64,
    /// Authored border-box width, resolved and **already clamped** to the
    /// min/max width bounds; `None` = unset (context decides: fill via
    /// [`Self::w_or_fill`], or required).
    pub w: Option<f64>,
    /// Authored border-box height, resolved and **already clamped** to the
    /// min/max height bounds; `None` = unset (auto).
    pub h: Option<f64>,
    /// x offset within the parent including the left margin — kept for
    /// the fill-width math.
    dx: f64,
    /// Resolved `(minWidth, maxWidth)` bounds (D3); reapplied to the fill
    /// width in [`Self::w_or_fill`].
    w_bounds: (Option<f64>, Option<f64>),
    /// Resolved `(minHeight, maxHeight)` bounds (D3); reapplied to an
    /// auto height in [`Self::clamp_h`].
    h_bounds: (Option<f64>, Option<f64>),
}

impl ResolvedBox {
    /// Resolves an item box against its parent. All lengths pass the
    /// crate's range caps; out-of-range parts fall back to unset/0 with
    /// a diagnostic.
    pub fn resolve(b: &OptBox, basis: &Basis, diags: &mut Diagnostics) -> Self {
        let margin = resolve_edges(b.margin.as_ref(), basis, diags);
        let margin_auto = b.margin.map(|m| m.auto_sides()).unwrap_or([false; 4]);
        let padding = resolve_edges(b.padding.as_ref(), basis, diags);
        let dx = resolve_x(b.x, basis, diags).unwrap_or(0.0) + margin[3];
        // Min/max bounds (D3): width against the width basis, height
        // against the height basis, same axis rules as `w`/`h`.
        let w_bounds = (
            resolve_x(b.min_width, basis, diags),
            resolve_x(b.max_width, basis, diags),
        );
        let h_bounds = (
            resolve_y(b.min_height, basis, diags),
            resolve_y(b.max_height, basis, diags),
        );
        ResolvedBox {
            margin,
            margin_auto,
            padding,
            x: basis.x + dx,
            // Authored sizes are clamped up front so every consumer of
            // `rb.w`/`rb.h` sees the constrained value.
            w: resolve_x(b.w, basis, diags).map(|w| clamp_size(w, w_bounds.0, w_bounds.1)),
            h: resolve_y(b.h, basis, diags).map(|h| clamp_size(h, h_bounds.0, h_bounds.1)),
            dx,
            w_bounds,
            h_bounds,
        }
    }

    /// Border-box width: the authored one (already clamped), or fill the
    /// parent minus the x offset and right margin, floored at `min`
    /// (contexts differ: most fill to ≥ 1pt, repeat cells to ≥ 0), then
    /// clamped to the min/max width bounds (D3).
    pub fn w_or_fill(&self, basis: &Basis, min: f64) -> f64 {
        self.w.unwrap_or_else(|| {
            let fill = (basis.w - self.dx - self.margin[1]).max(min);
            clamp_size(fill, self.w_bounds.0, self.w_bounds.1)
        })
    }

    /// The authored height, or — when the parent handed one down in
    /// `fill_h` (a `stretch` row's cross size, or a column child's
    /// `flexGrow` share) — that outer height minus this box's vertical
    /// margins, clamped to the `minHeight`/`maxHeight` bounds.
    ///
    /// The height mirror of [`Self::w_or_fill`], and it returns an
    /// `Option` rather than an `f64` because an unsized height without a
    /// cross fill is still genuinely unset: the box takes its content
    /// height, which only the caller can compute. That is why the fill
    /// could not be folded into `resolve_box` — "no authored height" and
    /// "height comes from the parent" are different answers.
    ///
    /// The three conditions are CSS's, in CSS's order (Flexbox §9.4
    /// "Cross Size Determination"): the item takes the handed-down height
    /// only if its own is auto, **neither vertical margin is `auto`**,
    /// and the parent has one to give. An `auto` margin beats alignment
    /// everywhere else in this engine, and this is no exception —
    /// `margin: { top: auto }` on a row child means "push me down", which
    /// filling the row would silently overrule, and on a column child it
    /// is what makes it absorb the free space instead of growing into it.
    /// The result is the used OUTER size, so the margins come off before
    /// the clamp.
    pub fn h_or_fill(&self, basis: &Basis) -> Option<f64> {
        if let Some(h) = self.h {
            return Some(h);
        }
        if self.margin_auto[0] || self.margin_auto[2] {
            return None;
        }
        let outer = basis.fill_h?;
        let fill = (outer - self.margin[0] - self.margin[2]).max(0.0);
        Some(clamp_size(fill, self.h_bounds.0, self.h_bounds.1))
    }

    /// Clamps an auto (content-derived) height to the min/max height
    /// bounds (D3). Authored heights are clamped at resolve; this is for
    /// the use sites that compute an auto height (`container_atom`). A
    /// no-op when neither bound is set.
    pub fn clamp_h(&self, auto: f64) -> f64 {
        clamp_size(auto, self.h_bounds.0, self.h_bounds.1)
    }

    /// The resolved `(minHeight, maxHeight)` bounds (D3), for callers
    /// that build the height themselves and cannot go through
    /// [`Self::clamp_h`] as a single value — `text_block` clamps its
    /// auto height *before* distributing vertical-align slack, so a
    /// `minHeight` taller than the text recenters it (CSS parity).
    pub fn h_bounds(&self) -> (Option<f64>, Option<f64>) {
        self.h_bounds
    }

    /// Content-box left edge (border box inset by the left padding).
    pub fn content_x(&self) -> f64 {
        self.x + self.padding[3]
    }

    /// Content-box width for a known border-box width, clamped at 0
    /// since padding may exceed the box.
    pub fn content_w(&self, w: f64) -> f64 {
        (w - self.padding[3] - self.padding[1]).max(0.0)
    }

    /// Content-box height for a known border-box height, clamped at 0.
    pub fn content_h(&self, h: f64) -> f64 {
        (h - self.padding[0] - self.padding[2]).max(0.0)
    }

    /// Vertical padding sum: what an auto height adds around its
    /// content.
    pub fn v_padding(&self) -> f64 {
        self.padding[0] + self.padding[2]
    }
}

#[cfg(test)]
mod tests;
