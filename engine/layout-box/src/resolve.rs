//! Guarded length/edge resolution: `%` -> absolute pt against a
//! [`Basis`], with the range caps untrusted templates require.

use crate::Basis;
use shojiku_core::{EdgeSpec, Length};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};

/// Sanity bound on any resolved length. Untrusted templates drive `%`
/// math through nested containers; a chain of >100% values amplifies
/// geometrically, so out-of-range results are dropped with a diagnostic
/// instead of poisoning downstream math.
pub const MAX_RESOLVED_PT: f64 = 1_000_000.0;

/// Range-checks a resolved length. Out-of-range values (hostile `%`
/// amplification or absurd pt values) are dropped with a diagnostic so
/// callers fall back to their defaults.
fn cap_len(value: f64, diags: &mut Diagnostics) -> Option<f64> {
    if value.is_finite() && value.abs() <= MAX_RESOLVED_PT {
        Some(value)
    } else {
        diags.push(
            Diagnostic::new(Code::LengthOutOfRange)
                .arg("value", value)
                .arg("max", MAX_RESOLVED_PT),
        );
        None
    }
}

/// Clamps a resolved size to its `min`/`max` bounds in CSS order — min
/// wins over max wins over the size (`min-width` beats `max-width` when
/// they conflict). Bounds are already resolved to pt and range-capped;
/// this is pure finite arithmetic, so a hostile `min > max` (or a
/// negative bound) is well-defined, never a panic. Unset bounds
/// (`None`) leave the value untouched.
pub fn clamp_size(value: f64, min: Option<f64>, max: Option<f64>) -> f64 {
    let mut v = value;
    if let Some(max) = max {
        v = v.min(max);
    }
    if let Some(min) = min {
        v = v.max(min);
    }
    v
}

/// Resolves a horizontal length (`x`/`w`); the width basis is always
/// definite.
pub fn resolve_x(len: Option<Length>, basis: &Basis, diags: &mut Diagnostics) -> Option<f64> {
    let len = len?;
    cap_len(len.resolve(basis.pct_base(), basis.font), diags)
}

/// Resolves a vertical length (`y`/`h`). Absolute lengths (pt and
/// physical units) and font-relative ones (`em`/`rem`) need no height
/// basis; a `%` against an auto-height container has no basis and is
/// dropped with a diagnostic.
pub fn resolve_y(len: Option<Length>, basis: &Basis, diags: &mut Diagnostics) -> Option<f64> {
    let len = len?;
    let value = match (len, basis.h) {
        (Length::Percent(_), Some(h)) => len.resolve(h, basis.font),
        (Length::Percent(_), None) => {
            diags.push(Diagnostic::new(Code::PercentOfAuto));
            return None;
        }
        // Everything else ignores the height basis (0.0 is inert).
        _ => len.resolve(0.0, basis.font),
    };
    cap_len(value, diags)
}

/// Resolves a box's `margin`/`padding` to pt `[top, right, bottom,
/// left]`. Every edge resolves against the parent *width* (the CSS rule
/// for margin/padding `%`), so vertical edges stay definite even in
/// auto-height containers. Out-of-range edges drop to 0 via the usual
/// cap. Parse guarantees padding is non-negative; content sizes are
/// still clamped at the use sites since padding can exceed the box.
pub fn resolve_edges(edges: Option<&EdgeSpec>, basis: &Basis, diags: &mut Diagnostics) -> [f64; 4] {
    let Some(spec) = edges else { return [0.0; 4] };
    spec.edges()
        .map(|len| resolve_x(Some(len), basis, diags).unwrap_or(0.0))
}

#[cfg(test)]
mod tests;
