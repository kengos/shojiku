//! Diagnostic-arg helpers for the suite.
//!
//! The horizontal-overflow family carries NUMBERS only — that is what
//! lets a translating consumer write its own sentence instead of passing
//! the engine's English through — so its tests assert on the args rather
//! than on the rendered message.

use shojiku_diagnostics::{ArgValue, Diagnostic};

/// A diagnostic's numeric arg, or `None` when absent or not a number.
pub fn arg_num(d: &Diagnostic, key: &str) -> Option<f64> {
    match d.args.get(key) {
        Some(ArgValue::Num(n)) => Some(*n),
        _ => None,
    }
}

/// True when every arg a diagnostic carries is a number — i.e. nothing in
/// the payload needs translating.
pub fn args_all_numeric(d: &Diagnostic) -> bool {
    d.args.values().all(|v| matches!(v, ArgValue::Num(_)))
}
