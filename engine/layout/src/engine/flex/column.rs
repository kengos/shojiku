//! The column side of the flex walk: the main-axis `flexGrow` pre-pass
//! (heights measured, then shared) and the per-item main/cross offsets.
//! Distribution math comes from `shojiku-layout-box`.

use shojiku_layout_box::{auto_share, cross_offset, main_spacing, resolve_flex_lengths, FlexItem};

use super::super::{Atom, Basis, Ctx};
use super::{FlexKind, FlexSpec};

impl<'a, 'b> Ctx<'a, 'b> {
    /// Plans a column's main-axis heights when a child authors
    /// `flexGrow`, returning one basis per flex child.
    ///
    /// A column's MAIN axis is the height, so `flexGrow` there is the
    /// same flexible-length resolution `plan_row` runs on width — with
    /// one difference that decides the whole shape: a row child's basis
    /// is its max-content width, which `max_content_width` computes
    /// without placing anything, while a column child's basis is its
    /// CONTENT HEIGHT, which nothing knows until the child has been laid
    /// out. So this measures once (parked, the `measure_cell` idiom, so
    /// nothing the throwaway placement says reaches the author) and hands
    /// each child its resolved share; the caller then places for real
    /// exactly once.
    ///
    /// Returns `None` — and costs nothing at all, not even the pre-scan's
    /// worth of work — unless the column has a definite height AND some
    /// child actually authored a positive `flexGrow`. Since `flexGrow`
    /// sits at its CSS default of 0, that is every ordinary column: the
    /// default path never doubles a placement.
    ///
    /// GROW ONLY. When the children's content heights already fill or
    /// overflow a definite parent, they keep them and this returns
    /// `None`. Shrinking on the ROW axis makes a long line re-wrap and
    /// stay visible; height has no such fallback, so a column shrink
    /// would only clip — and `column` is the default `direction`, so
    /// mirroring CSS's implicit `flex-shrink: 1` here would re-size the
    /// children of every container ever authored. Named as a deviation
    /// in `docs/engine/flex.md`.
    pub(super) fn plan_column(
        &mut self,
        kinds: &[(usize, FlexKind)],
        inner: &Basis,
        spec: &FlexSpec,
        depth: usize,
    ) -> Option<Vec<Basis>> {
        let h = inner.h?;
        let n = kinds.len();
        // Pre-scan, on the authored boxes alone: who can grow at all?
        // A child with an authored height is a fixed slot, exactly as an
        // authored `w` is in a row — its main size is not flexible.
        // Sanitizing here rather than after `begin_measure` is what keeps
        // an `invalid_flex_grow` warning reaching the author.
        let mut weights = Vec::with_capacity(n);
        for (index, kind) in kinds {
            let b = kind.box_();
            let weight = if b.h.is_some() {
                0.0
            } else {
                let mark = self.enter_item(format!("items[{index}]"));
                let w = self.grow_weight(b.flex_grow.unwrap_or(0.0));
                self.leave_item(mark);
                w
            };
            weights.push(weight);
        }
        if !weights.iter().any(|w| *w > 0.0) {
            return None;
        }
        if !self.spend_reflow(n) {
            return None;
        }
        let gap = self.resolve_y(spec.gap, inner).unwrap_or(0.0).max(0.0);
        let free = h - gap * n.saturating_sub(1) as f64;
        let heights = self.measure_column_heights(kinds, inner, depth);
        // Grow only: no room means every child keeps what it measured,
        // and the caller places against the plain parent basis.
        if heights.iter().sum::<f64>() >= free {
            return None;
        }
        let items = self.column_flex_items(kinds, inner, &heights, &weights);
        let shares = resolve_flex_lengths(free, &items);
        Some(
            shares
                .into_iter()
                .zip(&weights)
                .map(|(share, weight)| Basis {
                    // Only a grower is handed a height. Everything else
                    // keeps `fill_h: None` so it takes the content height
                    // it measured, unchanged.
                    fill_h: (*weight > 0.0).then_some(share),
                    ..*inner
                })
                .collect(),
        )
    }

    /// Each child as the resolution sees it: the content height it
    /// measured, its grow weight, and its `minHeight`/`maxHeight` bounds.
    ///
    /// The bounds are resolved against the CONTAINER, never against the
    /// share being computed — the same reason `plan_row` resolves them
    /// against `inner` and leaves `pct_w` pointing at the container.
    /// They apply to the OUTER height, matching the measured bases.
    fn column_flex_items(
        &mut self,
        kinds: &[(usize, FlexKind)],
        inner: &Basis,
        heights: &[f64],
        weights: &[f64],
    ) -> Vec<FlexItem> {
        kinds
            .iter()
            .zip(heights)
            .zip(weights)
            .map(|(((index, kind), basis), weight)| {
                let b = kind.box_();
                let mark = self.enter_item(format!("items[{index}]"));
                let min = self.resolve_y(b.min_height, inner);
                let max = self.resolve_y(b.max_height, inner);
                self.leave_item(mark);
                FlexItem {
                    basis: *basis,
                    weight: *weight,
                    min,
                    max,
                }
            })
            .collect()
    }

    /// Every flex child's content height, measured and thrown away.
    ///
    /// Mirrors `measure_row_cross`: the placement this makes is not the
    /// one the author gets, so it runs parked and nothing it emits may
    /// escape. A child that produces no atom contributes 0 — the same
    /// height it will contribute to the real pass, where it is skipped.
    fn measure_column_heights(
        &mut self,
        kinds: &[(usize, FlexKind)],
        inner: &Basis,
        depth: usize,
    ) -> Vec<f64> {
        let parked = self.begin_measure();
        let heights = kinds
            .iter()
            .map(|(_, kind)| {
                self.flex_child_atom(*kind, inner, depth)
                    .map_or(0.0, |atom| atom.height)
            })
            .collect();
        self.end_measure(parked);
        heights
    }

    /// Column main-axis (y) and cross-axis (x) offsets per flex atom:
    /// items stack with `gap`; with a definite parent height, auto
    /// vertical margins absorb the free space, then `justifyContent`
    /// distributes what remains. Cross: a child with an authored width
    /// aligns per `alignItems` / auto horizontal margins (an unsized
    /// child fills — the `stretch` behavior).
    ///
    /// Anything `flexGrow` claimed is already inside `atom.height` by the
    /// time this runs, so the free space here is what growth left over —
    /// which is why CSS's order (grow, then auto margins, then
    /// `justifyContent`) falls out of the pass structure rather than
    /// needing to be sequenced by hand.
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
