//! `TrackSpec` resolution: the wire form (count or track list) to
//! per-track pt sizes, with the hostile-input caps — track counts and
//! list lengths clamp to `MAX_GRID_TRACKS` with a diagnostic, negative
//! tracks clamp to 0, and `rows: N` needs a definite height to split.
//!
//! A track list mixes fixed lengths and `fr` weights: fixed tracks
//! resolve against the axis, then the leftover (axis size minus the
//! fixed tracks and gaps) distributes across the `fr` weights the way
//! `flexGrow` does. `fr` rows need a definite container height like a
//! `Count` split; an auto-height container degrades them to auto rows.

use shojiku_core::{GridTrack, TrackSpec, MAX_GRID_TRACKS};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};
use shojiku_layout_box::{equal_track, grow_shares};

use super::super::{Basis, Ctx};

impl<'a, 'b> Ctx<'a, 'b> {
    /// Column track widths (always ≥ 1 track). A count splits the
    /// content width evenly; a track list resolves each fixed size
    /// against it (`%` of the parent width) and distributes the leftover
    /// across any `fr` weights. Unset means one full-width column.
    pub(super) fn column_tracks(
        &mut self,
        spec: Option<&TrackSpec>,
        total_w: f64,
        gap: f64,
    ) -> Vec<f64> {
        match spec {
            None => vec![total_w.max(0.0)],
            Some(TrackSpec::Count(n)) => {
                let count = self.clamped_tracks(*n, "columns");
                vec![equal_track(total_w, gap, count); count]
            }
            Some(TrackSpec::Tracks(list)) => {
                if list.is_empty() {
                    self.diags
                        .push(Diagnostic::new(Code::GridTracksClamped).arg(
                            "detail",
                            "`columns` track list is empty; using one full-width column",
                        ));
                    return vec![total_w.max(0.0)];
                }
                let take = self.clamped_tracks(list.len(), "columns");
                let basis = Basis {
                    x: 0.0,
                    w: total_w,
                    h: None,
                    font: self.font_rel(),
                };
                let mut sizes = vec![0.0; take];
                let mut frs: Vec<(usize, f64)> = Vec::new();
                let mut fixed_sum = 0.0;
                for (i, track) in list.iter().take(take).enumerate() {
                    match track {
                        GridTrack::Fixed(len) => {
                            let pt = self.resolve_x(Some(*len), &basis).unwrap_or(0.0).max(0.0);
                            sizes[i] = pt;
                            fixed_sum += pt;
                        }
                        GridTrack::Fr(w) => frs.push((i, *w)),
                    }
                }
                let gaps = gap * take.saturating_sub(1) as f64;
                distribute_fr(&mut sizes, &frs, total_w - fixed_sum - gaps);
                sizes
            }
        }
    }

    /// Explicit row heights per row index (`None` = auto: the row takes
    /// its tallest child). A count splits a definite content height
    /// evenly — an auto-height container cannot split and degrades to
    /// auto rows with a diagnostic. A track list sizes the fixed rows;
    /// `fr` rows split the leftover of a definite height (auto-height
    /// degrades them to auto); implicit rows beyond the list are auto.
    pub(super) fn row_tracks(
        &mut self,
        spec: Option<&TrackSpec>,
        inner: &Basis,
        gap: f64,
        rows_count: usize,
    ) -> Vec<Option<f64>> {
        match spec {
            None => vec![None; rows_count],
            Some(TrackSpec::Count(n)) => match inner.h {
                Some(h) => {
                    let count = self.clamped_tracks(*n, "rows");
                    let each = equal_track(h, gap, count);
                    (0..rows_count)
                        .map(|r| (r < count).then_some(each))
                        .collect()
                }
                None => {
                    self.diags.push(Diagnostic::new(Code::PercentOfAuto));
                    vec![None; rows_count]
                }
            },
            Some(TrackSpec::Tracks(list)) => {
                let take = self.clamped_tracks(list.len(), "rows");
                let mut out: Vec<Option<f64>> = vec![None; rows_count];
                let mut frs: Vec<(usize, f64)> = Vec::new();
                let mut fixed_sum = 0.0;
                for (r, track) in list.iter().take(take).enumerate() {
                    match track {
                        GridTrack::Fixed(len) => {
                            let v = self.resolve_y(Some(*len), inner).map(|v| v.max(0.0));
                            if let Some(pt) = v {
                                fixed_sum += pt;
                            }
                            out[r] = v;
                        }
                        GridTrack::Fr(w) => frs.push((r, *w)),
                    }
                }
                self.distribute_fr_rows(&mut out, &frs, inner.h, fixed_sum, gap, rows_count);
                out
            }
        }
    }

    /// Fills the `fr` rows in `out`. With a definite height they split
    /// the leftover (`h` minus the fixed rows and gaps); an auto-height
    /// container has no leftover, so they degrade to auto with a
    /// diagnostic (mirroring a `Count` split without a height).
    fn distribute_fr_rows(
        &mut self,
        out: &mut [Option<f64>],
        frs: &[(usize, f64)],
        height: Option<f64>,
        fixed_sum: f64,
        gap: f64,
        rows_count: usize,
    ) {
        if frs.is_empty() {
            return;
        }
        match height {
            Some(h) => {
                let gaps = gap * rows_count.saturating_sub(1) as f64;
                let mut sizes = vec![0.0; rows_count];
                distribute_fr(&mut sizes, frs, h - fixed_sum - gaps);
                for (r, _) in frs {
                    out[*r] = Some(sizes[*r]);
                }
            }
            None => self.diags.push(Diagnostic::new(Code::GridFrNoBasis)),
        }
    }

    /// Clamps a track count to `1..=MAX_GRID_TRACKS` with a diagnostic —
    /// a hostile count must not drive allocation or degenerate slivers.
    fn clamped_tracks(&mut self, n: usize, axis: &str) -> usize {
        let clamped = n.clamp(1, MAX_GRID_TRACKS);
        if clamped != n {
            self.diags
                .push(Diagnostic::new(Code::GridTracksClamped).arg(
                    "detail",
                    format!(
                        "grid `{axis}` spans {n} tracks, outside 1..={MAX_GRID_TRACKS}; \
                         clamped to {clamped}"
                    ),
                ));
        }
        clamped
    }
}

/// Distributes `free` leftover space across the `fr` tracks by weight
/// (the `flexGrow` machinery), writing each share into `sizes` at its
/// recorded index. Negative leftover collapses every `fr` share to 0
/// and all-zero weights degrade to an equal split (both via
/// [`grow_shares`]). A no-op when there are no `fr` tracks.
fn distribute_fr(sizes: &mut [f64], frs: &[(usize, f64)], free: f64) {
    if frs.is_empty() {
        return;
    }
    let weights: Vec<f64> = frs.iter().map(|(_, w)| *w).collect();
    let shares = grow_shares(free, &weights);
    for ((idx, _), share) in frs.iter().zip(shares) {
        sizes[*idx] = share;
    }
}
