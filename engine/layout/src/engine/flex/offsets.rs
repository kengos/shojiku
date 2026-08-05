//! Flex offset computation: the row pre-pass (slot bases from measured
//! widths) and the per-item main/cross offsets, feeding the walk in the
//! parent module. Distribution math comes from `shojiku-layout-box`.

use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};
use shojiku_layout_box::{
    auto_share, clamp_size, cross_offset, grow_shares, main_spacing, resolve_edges,
};

use super::super::{Atom, Basis, Ctx, H_OVERFLOW_EPS};
use super::{FlexKind, FlexSpec};

impl<'a, 'b> Ctx<'a, 'b> {
    /// Sanitizes an authored `flexGrow` weight: a negative or non-finite
    /// value warns (`invalid_flex_grow`) and degrades to 0 (never
    /// grows), matching the warn+clamp posture of the resolve guards.
    fn grow_weight(&mut self, g: f64) -> f64 {
        if g.is_finite() && g >= 0.0 {
            g
        } else {
            self.diags
                .push(Diagnostic::new(Code::InvalidFlexGrow).arg("value", g));
            0.0
        }
    }

    /// Plans the row bases: fixed-width children (authored `w`) keep it,
    /// children without split the leftover width by their `flexGrow`
    /// weight (default 1 = an equal split, D4). With no unsized children,
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
        // `flexGrow` weights for the unsized children, in order (D4).
        let mut weights: Vec<f64> = Vec::new();
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
            // Clamp the authored width to its min/max bounds (D3) so the
            // planned slot matches the width the child's ResolvedBox will
            // report. An unsized (flex-share) child's min/max is deferred
            // and not modelled yet.
            let min = self.resolve_x(b.min_width, inner);
            let max = self.resolve_x(b.max_width, inner);
            let outer = self
                .resolve_x(b.w, inner)
                .map(|w| clamp_size(w, min, max) + m[3] + m[1]);
            if outer.is_none() {
                weights.push(self.grow_weight(b.flex_grow()));
            }
            outers.push(outer);
            self.leave_item(mark);
        }
        let fixed: f64 = outers.iter().flatten().sum();
        let free = inner.w - fixed - gap * n.saturating_sub(1) as f64;
        // Fixed widths + gaps already exceed the parent content box:
        // the row spills off the right edge with nothing to shrink
        // (unsized shares degrade to 0). Only the pixels showed this
        // until now; `overflow: hidden` parents clip by intent and
        // stay silent (the container_overflow convention).
        if free < -H_OVERFLOW_EPS && !clipped {
            self.diags.push(
                Diagnostic::new(Code::FlexRowOverflow)
                    .arg("needed", fixed + gap * n.saturating_sub(1) as f64)
                    .arg("avail", inner.w),
            );
        }
        let (shares, lead, between, auto_sh) = if !weights.is_empty() {
            // Unsized children consume all free space, split by their
            // `flexGrow` weights (flex-grow before auto margins and
            // justification, the CSS order).
            (grow_shares(free, &weights), 0.0, 0.0, 0.0)
        } else {
            let auto_count = autos.iter().map(|a| a[3] as usize + a[1] as usize).sum();
            let (auto_sh, jfree) = if auto_count > 0 && free > 0.0 {
                (auto_share(free, auto_count), 0.0)
            } else {
                (0.0, free)
            };
            let (lead, between) = main_spacing(jfree, n, spec.justify);
            (Vec::new(), lead, between, auto_sh)
        };
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
            // An unsized child's `%` margins resolve against its share
            // (v1 deviation from CSS's container-relative rule, noted in
            // docs/engine/flex.md); a fixed child sees the container width.
            let basis_w = if outer.is_some() { inner.w } else { outer_w };
            bases.push(Basis {
                x: cur,
                w: basis_w,
                h: inner.h,
                font: inner.font,
            });
            cur += outer_w;
            if auto[1] {
                cur += auto_sh;
            }
            cur += gap + between;
        }
        bases
    }

    /// Column main-axis (y) and cross-axis (x) offsets per flex atom:
    /// items stack with `gap`; with a definite parent height, auto
    /// vertical margins absorb the free space, then `justifyContent`
    /// distributes what remains. Cross: a child with an authored width
    /// aligns per `alignItems` / auto horizontal margins (an unsized
    /// child fills — the `stretch` behavior).
    pub(super) fn column_offsets(
        &mut self,
        atoms: &[&Atom],
        inner: &Basis,
        spec: &FlexSpec,
    ) -> Vec<(f64, f64)> {
        let n = atoms.len();
        let gap = self.resolve_y(spec.gap, inner).unwrap_or(0.0).max(0.0);
        let total: f64 =
            atoms.iter().map(|a| a.height).sum::<f64>() + gap * n.saturating_sub(1) as f64;
        let auto_count: usize = atoms
            .iter()
            .map(|a| {
                a.rb.map_or(0, |rb| {
                    rb.margin_auto[0] as usize + rb.margin_auto[2] as usize
                })
            })
            .sum();
        // An auto-height parent has no free space: children just stack.
        let (auto_sh, lead, between) = match inner.h {
            None => (0.0, 0.0, 0.0),
            Some(h) => {
                let free = h - total;
                if auto_count > 0 && free > 0.0 {
                    (auto_share(free, auto_count), 0.0, 0.0)
                } else {
                    let (lead, between) = main_spacing(free, n, spec.justify);
                    (0.0, lead, between)
                }
            }
        };
        let mut offs = Vec::with_capacity(n);
        let mut cur = lead;
        for atom in atoms {
            // Every flex atom kind records its resolved box; `map_or`
            // keeps the (unreachable) no-box default out of a dead arm.
            let auto_top = atom.rb.is_some_and(|rb| rb.margin_auto[0]);
            let auto_bottom = atom.rb.is_some_and(|rb| rb.margin_auto[2]);
            // A child without an authored width fills (stretch): no free
            // cross space. With one, rb.x already contains the left
            // margin; free space is what's right of the border box +
            // right margin.
            let dx = atom
                .rb
                .and_then(|rb| rb.w.map(|w| (rb, w)))
                .map_or(0.0, |(rb, w)| {
                    let free = inner.w - ((rb.x - inner.x) + w + rb.margin[1]);
                    cross_offset(free, spec.align, rb.margin_auto[3], rb.margin_auto[1])
                });
            if auto_top {
                cur += auto_sh;
            }
            let dy = cur;
            cur += atom.height;
            if auto_bottom {
                cur += auto_sh;
            }
            cur += gap + between;
            offs.push((dy, dx));
        }
        offs
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
