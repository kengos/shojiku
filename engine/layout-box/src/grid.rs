//! Static-grid track math (box-model Phase 3): equal-track sizing and
//! cumulative track offsets. Pure numbers; the engine resolves the
//! `TrackSpec` wire form and applies the caps before calling in.

/// Equal track size for `count` tracks filling `total` with `gap`
/// between them: `(total - gaps) / count`, clamped at 0 so over-gapped
/// or negative axes produce empty tracks, never negative ones. Zero
/// tracks yield 0 (callers clamp the count to ≥ 1 first).
pub fn equal_track(total: f64, gap: f64, count: usize) -> f64 {
    if count == 0 {
        return 0.0;
    }
    ((total - gap * (count - 1) as f64) / count as f64).max(0.0)
}

/// Cumulative offsets for tracks of the given sizes: the first track
/// starts at `start`, each next one after the previous size plus `gap`
/// (callers fold any justify `between` share into `gap`).
pub fn track_offsets(sizes: &[f64], gap: f64, start: f64) -> Vec<f64> {
    let mut out = Vec::with_capacity(sizes.len());
    let mut cur = start;
    for size in sizes {
        out.push(cur);
        cur += size + gap;
    }
    out
}

#[cfg(test)]
mod tests;
