//! Definite-height overflow bookkeeping shared by the plain ([`super::block`])
//! and rich ([`super::rich`]) block builders: available content height, the
//! final reserved height under an overflow policy, and the post-policy
//! overflow warning. ONE home — the two builders once duplicated this
//! sequence (and computed `avail` twice each), which is exactly how a
//! one-sided edit ships.

use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};
use shojiku_layout_box::clamp_size;

use super::super::Ctx;

/// Content-box height available inside a definite border-box height `h`:
/// top/bottom padding removed, floored at zero (padding may exceed a
/// hostile authored height).
pub(super) fn content_avail(h: f64, padding: [f64; 4]) -> f64 {
    (h - padding[0] - padding[2]).max(0.0)
}

/// The final reserved block height. Under `clip` the block reserves
/// exactly the authored height (content past it is cut, so there is
/// nothing to grow for). With an authored height and no clip it grows to
/// fit (warn-and-grow). With no authored height it is the padded content
/// height clamped to the min/max bounds (a `minHeight` taller than the
/// text reserves the extra space, which vertical-align distributes).
pub(super) fn block_height(
    box_h: Option<f64>,
    clip: bool,
    padded_h: f64,
    h_bounds: (Option<f64>, Option<f64>),
) -> f64 {
    match box_h {
        Some(h) if clip => h,
        Some(h) => h.max(padded_h),
        None => clamp_size(padded_h, h_bounds.0, h_bounds.1),
    }
}

impl Ctx<'_, '_> {
    /// Warns `text_overflow` when content still exceeds a definite box
    /// after the overflow policy ran. Suppressed under `clip` — the
    /// author opted in to cutting. `avail` is `None` for auto-height
    /// boxes (they grow, never overflow).
    pub(super) fn warn_block_overflow(&mut self, avail: Option<f64>, content_h: f64, clip: bool) {
        if let Some(avail) = avail {
            if content_h > avail + 0.01 && !clip {
                self.diags.push(
                    Diagnostic::new(Code::TextOverflow)
                        .arg("content", content_h)
                        .arg("avail", avail),
                );
            }
        }
    }
}
