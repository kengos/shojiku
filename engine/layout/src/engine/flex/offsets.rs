//! The row side of the flex walk: the main-axis pre-pass (slot bases
//! from measured widths) and the cross-axis offsets, feeding the walk in
//! the parent module. Distribution math comes from `shojiku-layout-box`.

use shojiku_core::FlexBasis;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};
use shojiku_layout_box::{
    auto_share, clamp_size, cross_offset, main_spacing, resolve_edges, resolve_flex_lengths,
    FlexItem,
};

use super::super::{Atom, Basis, Ctx, H_OVERFLOW_EPS};
use super::{FlexKind, FlexSpec};

impl<'a, 'b> Ctx<'a, 'b> {
    /// Plans the row bases: fixed-width children (authored `w`) keep it,
    /// children without split the leftover width by their `flexGrow`
    /// weight (default 1 = an equal split). With no unsized children,
    /// auto margins absorb the free space, then `justifyContent`
    /// distributes what remains. Each basis carries the slot x; fixed
    /// children see the full parent width (so `%` resolves against the
    /// container, per CSS), unsized ones their share.
    ///
    /// `kinds` pairs each flex child with its DOCUMENT index (the walk's
    /// `items[i]`, which the `FlexKind::of` filter would otherwise lose):
    /// this pass resolves the same child boxes the atom pass will, so both
    /// copies of a guard warning must name the same item or the output
    /// dedup can no longer collapse them.
    pub(super) fn plan_row(
        &mut self,
        kinds: &[(usize, FlexKind)],
        inner: &Basis,
        spec: &FlexSpec,
        clipped: bool,
        depth: usize,
    ) -> Vec<Basis> {
        let n = kinds.len();
        let gap = self.resolve_x(spec.gap, inner).unwrap_or(0.0).max(0.0);
        // An auto-size checkbox (no authored `w`/`h`) reserves the same
        // cap-height square its atom will draw, so it stays a fixed slot
        // beside its label instead of stretching as a flex share.
        let cap_square = kinds
            .iter()
            .any(|(_, k)| matches!(k, FlexKind::Checkbox(_)))
            .then(|| self.inherited_cap_square());
        // Measure: outer main size (w + horizontal margins) per fixed
        // child, margins and auto flags for all.
        let mut outers: Vec<Option<f64>> = Vec::with_capacity(n);
        let mut autos: Vec<[bool; 4]> = Vec::with_capacity(n);
        // The unsized (flex-share) children, in order: each carries the
        // basis it starts from and the clamp bounds the resolution loop
        // freezes against.
        let mut flexible: Vec<FlexItem> = Vec::new();
        for (index, kind) in kinds {
            // Everything resolved here belongs to THIS child, so its
            // diagnostics are stamped with the child's address, not the
            // container's.
            let mark = self.enter_item(format!("items[{index}]"));
            let mut b = kind.box_();
            if let (FlexKind::Checkbox(_), Some(sq)) = (kind, cap_square) {
                b.w = b.w.or(Some(shojiku_core::Length::Pt(sq)));
                b.h = b.h.or(Some(shojiku_core::Length::Pt(sq)));
            }
            let m = resolve_edges(b.margin.as_ref(), inner, &mut self.diags);
            autos.push(b.margin.map(|e| e.auto_sides()).unwrap_or([false; 4]));
            // Clamp the authored width to its min/max bounds so the
            // planned slot matches the width the child's ResolvedBox will
            // report. An unsized child carries the same bounds into the
            // resolution loop, which clamps them AFTER growth.
            let min = self.resolve_x(b.min_width, inner);
            let max = self.resolve_x(b.max_width, inner);
            let outer = self
                .resolve_x(b.w, inner)
                .map(|w| clamp_size(w, min, max) + m[3] + m[1]);
            if outer.is_none() {
                // CSS `flex-basis`: `content` (the default) starts from
                // the child's max-content width, `0` starts from nothing
                // so `flexGrow` divides the whole row (CSS's `flex: 1`).
                let measured = match b.flex_basis() {
                    FlexBasis::Zero => Some(0.0),
                    FlexBasis::Content => self.max_content_width(kind, inner, depth),
                };
                // A kind whose intrinsic width is UNDEFINED — a table, a
                // vertical-writing block, a list — cannot size to its
                // content, and a basis of 0 with CSS's `flex-grow: 0`
                // would collapse it to nothing. It keeps the share it had
                // before content sizing existed: it grows unless the
                // author said otherwise. Two tables side by side is the
                // case that proves it.
                let default_grow = if measured.is_none() { 1.0 } else { 0.0 };
                let weight = self.grow_weight(b.flex_grow.unwrap_or(default_grow));
                let basis = measured.unwrap_or(0.0);
                flexible.push(FlexItem {
                    basis: basis + m[3] + m[1],
                    weight,
                    // The bounds apply to the OUTER size, matching the
                    // clamp a fixed child gets above.
                    min: min.map(|v| v + m[3] + m[1]),
                    max: max.map(|v| v + m[3] + m[1]),
                });
            }
            outers.push(outer);
            self.leave_item(mark);
        }
        let fixed: f64 = outers.iter().flatten().sum();
        let gaps = gap * n.saturating_sub(1) as f64;
        let free = inner.w - fixed - gaps;
        // CSS order, and all three steps run every time: resolve the
        // flexible lengths, let auto margins absorb what is left, then
        // let `justifyContent` distribute the remainder.
        //
        // The middle and last steps used to be skipped whenever the row
        // had any unsized child, which was harmless only because such a
        // child always grew to eat the leftover. With `flexGrow` at its
        // CSS default of 0 it usually does not, so there is real free
        // space to place — and `justifyContent: center` on a row of
        // content-sized children has to mean something.
        let shares = if flexible.is_empty() {
            Vec::new()
        } else {
            // Unsized children start at their basis; the leftover is
            // handed out by `flexGrow`, or — when the bases overflow —
            // taken back in proportion so the content re-wraps
            // (`flex-shrink: 1`). Either way min/max freezes an item at
            // its bound.
            resolve_flex_lengths(free, &flexible)
        };
        let leftover = free - shares.iter().sum::<f64>();
        let auto_count = autos.iter().map(|a| a[3] as usize + a[1] as usize).sum();
        let (auto_sh, jfree) = if auto_count > 0 && leftover > 0.0 {
            (auto_share(leftover, auto_count), 0.0)
        } else {
            (0.0, leftover)
        };
        let (lead, between) = main_spacing(jfree, n, spec.justify);
        // The overflow verdict belongs AFTER resolution, not before it:
        // a row whose content bases exceed the container usually shrinks
        // back to fit, and reporting the bases would cry overflow over
        // every wrapped paragraph. What survives here is a row that
        // could NOT be made to fit — fixed widths and gaps that already
        // exceed the box, or `minWidth` floors that stopped the shrink.
        // `overflow: hidden` parents clip by intent and stay silent (the
        // container_overflow convention).
        let used: f64 = inner.w - leftover;
        if used - inner.w > H_OVERFLOW_EPS && !clipped {
            self.diags.push(
                Diagnostic::new(Code::FlexRowOverflow)
                    .arg("needed", used)
                    .arg("avail", inner.w),
            );
        }
        let mut bases = Vec::with_capacity(n);
        let mut cur = inner.x + lead;
        // `shares` is aligned to the unsized children in order.
        let mut unsized_i = 0;
        for (outer, auto) in outers.iter().zip(&autos) {
            if auto[3] {
                cur += auto_sh;
            }
            let outer_w = match outer {
                Some(w) => *w,
                None => {
                    let s = shares[unsized_i];
                    unsized_i += 1;
                    s
                }
            };
            // `Basis.w` is the width an unsized child FILLS (its slot),
            // while `pct_w` is the width its `%` lengths and `%` margins
            // resolve against — the flex CONTAINER, as CSS says. They are
            // the same for a child with an authored `w`, which sees the
            // container either way.
            let (basis_w, pct) = match outer {
                Some(_) => (inner.w, None),
                None => (outer_w, Some(inner.w)),
            };
            bases.push(Basis {
                x: cur,
                w: basis_w,
                h: inner.h,
                font: inner.font,
                pct_w: pct,
                // A row's CROSS axis is the height, so `alignItems:
                // stretch` (the default) hands a child with no authored
                // `h` the row's cross size — the mirror of an unsized
                // WIDTH filling a column's cross axis, which is what
                // `w_or_fill` has always done. There is only one to hand
                // down when `inner.h` is definite; an auto-height row
                // discovers its cross size from its tallest child, and
                // the measure pass in the parent module fills this in.
                fill_h: (spec.align == shojiku_core::AlignItems::Stretch)
                    .then_some(inner.h)
                    .flatten(),
            });
            cur += outer_w;
            if auto[1] {
                cur += auto_sh;
            }
            cur += gap + between;
        }
        bases
    }
}

/// Row cross-axis offsets: each atom aligns vertically within the row's
/// cross size (the parent content height when definite, else the
/// tallest child). Under `alignItems: baseline` the shifts instead line
/// up first-text baselines (`super::baseline`); children with cross-axis
/// auto margins keep the margin behavior (CSS: auto margins win over
/// alignment). Main-axis x is already baked into the planned bases, so
/// the x shift is always 0 here.
pub(super) fn row_cross(
    atoms: &[&Atom],
    inner: &Basis,
    spec: &FlexSpec,
    fonts: &crate::font::FontStore,
) -> Vec<(f64, f64)> {
    let tallest = atoms.iter().map(|a| a.height).fold(0.0, f64::max);
    let cross = inner.h.unwrap_or(tallest);
    let shifts = (spec.align == shojiku_core::AlignItems::Baseline)
        .then(|| super::baseline::baseline_shifts(atoms, fonts));
    atoms
        .iter()
        .enumerate()
        .map(|(i, atom)| {
            let (auto_top, auto_bottom) = atom
                .rb
                .map_or((false, false), |rb| (rb.margin_auto[0], rb.margin_auto[2]));
            let dy = match &shifts {
                Some(shifts) if !(auto_top || auto_bottom) => shifts[i],
                _ => cross_offset(cross - atom.height, spec.align, auto_top, auto_bottom),
            };
            (dy, 0.0)
        })
        .collect()
}
