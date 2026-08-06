//! Flex distribution math: main-axis spacing (`justifyContent`),
//! cross-axis alignment (`alignItems`), and auto-margin free-space
//! absorption. Axis-generic pure functions over already-measured sizes,
//! so the Phase-3 grid can reuse the same distribution.
//!
//! Untrusted-input posture: every division is count-guarded, negative
//! free space degrades the way CSS does (`space_*` behave like `start`,
//! auto margins collapse to 0, `center`/`end` may go negative but stay
//! finite), and callers feed sizes that already passed the resolve caps.

use shojiku_core::{AlignItems, JustifyContent};

mod lengths;

pub use lengths::{resolve_flex_lengths, FlexItem};

/// Main-axis spacing for `justifyContent` over `count` children with
/// `free` leftover space: returns `(leading, between)` — the offset
/// before the first child and the extra space between neighbours
/// (added on top of `gap`). `space_*` distribute nothing when `free`
/// is negative; `center`/`end` follow CSS and may shift negative.
pub fn main_spacing(free: f64, count: usize, justify: JustifyContent) -> (f64, f64) {
    if count == 0 {
        return (0.0, 0.0);
    }
    let n = count as f64;
    match justify {
        JustifyContent::Start => (0.0, 0.0),
        JustifyContent::Center => (free / 2.0, 0.0),
        JustifyContent::End => (free, 0.0),
        JustifyContent::SpaceBetween => {
            if count >= 2 {
                (0.0, free.max(0.0) / (n - 1.0))
            } else {
                (0.0, 0.0)
            }
        }
        JustifyContent::SpaceAround => {
            let share = free.max(0.0) / n;
            (share / 2.0, share)
        }
        JustifyContent::SpaceEvenly => {
            let share = free.max(0.0) / (n + 1.0);
            (share, share)
        }
    }
}

/// Cross-axis offset for one child with `free` leftover space. Auto
/// margins win over `alignItems` (CSS): both sides auto centers, a
/// single auto pushes the child to the opposite side; auto shares
/// clamp at 0 when the child overflows. `stretch` is the caller's job
/// (fill the cross size); here it aligns like `start`.
pub fn cross_offset(free: f64, align: AlignItems, auto_lead: bool, auto_trail: bool) -> f64 {
    match (auto_lead, auto_trail) {
        (true, true) => free.max(0.0) / 2.0,
        (true, false) => free.max(0.0),
        (false, true) => 0.0,
        (false, false) => match align {
            // `Baseline` reaching this generic offset means the caller has
            // no baseline data for the axis (a `column` container, grid
            // rows): CSS falls back to `start`. Real baseline alignment
            // is computed in the layout engine's row walk, where content
            // is known.
            AlignItems::Stretch | AlignItems::Start | AlignItems::Baseline => 0.0,
            AlignItems::Center => free / 2.0,
            AlignItems::End => free,
        },
    }
}

/// The share each auto main-axis margin absorbs: auto margins split the
/// free space equally and take it all before `justifyContent` sees any
/// (CSS order); nothing to absorb when space is short.
pub fn auto_share(free: f64, auto_count: usize) -> f64 {
    if auto_count == 0 || free <= 0.0 {
        0.0
    } else {
        free / auto_count as f64
    }
}

/// Equal main-size share for `row` children without an authored width
/// (`flex: 1` analog); clamps at 0 so over-full rows produce empty,
/// not negative, boxes.
pub fn equal_share(free: f64, count: usize) -> f64 {
    if count == 0 {
        0.0
    } else {
        (free / count as f64).max(0.0)
    }
}

/// Weighted main-size shares for `row` children without an authored
/// width (CSS `flex-grow`): child `i` takes `free × wᵢ / Σw` of the
/// leftover. Weights are clamped to ≥ 0 (so a stray negative or `NaN`
/// contributes nothing — `f64::max` drops `NaN`), and a zero total (all
/// weights 0) degrades to an equal split so the row is never silently
/// empty. Negative free clamps every share to 0, like [`equal_share`].
/// The returned vec is aligned to `weights`.
///
/// Shares stay finite under hostile-scale weights: `avail × w` can
/// overflow to `inf` (and `inf / inf` to `NaN` when `Σw` overflows too),
/// so a non-finite product falls back to the ratio-first order —
/// `avail × (w / Σw)` — which is exact there (`w/inf` = 0; `w/Σw` ≤ 1
/// otherwise) and keeps the common path's rounding untouched.
pub fn grow_shares(free: f64, weights: &[f64]) -> Vec<f64> {
    let clamped: Vec<f64> = weights.iter().map(|w| w.max(0.0)).collect();
    let total: f64 = clamped.iter().sum();
    if total <= 0.0 {
        return vec![equal_share(free, weights.len()); weights.len()];
    }
    let avail = free.max(0.0);
    clamped
        .iter()
        .map(|w| {
            let share = avail * w / total;
            if share.is_finite() {
                share
            } else {
                avail * (w / total)
            }
        })
        .collect()
}

#[cfg(test)]
mod tests;
