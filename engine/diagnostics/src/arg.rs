//! Typed diagnostic argument values.
//!
//! Each diagnostic carries a map of `name -> `[`ArgValue`], the structured
//! data a translating consumer (the React GUI's ICU catalog) needs to
//! render its own localized message from the stable `code`. The engine
//! never translates; it emits these args plus an English default rendering
//! of them.
//!
//! Values are **untrusted echoes** of template/params content, so every
//! string is sanitized (control characters stripped — no log/terminal
//! injection) and clipped, and every number is forced finite. `ArgValue`
//! serializes as a bare JSON scalar (`"x"` / `3.5` / `true`) so a consumer
//! sees plain values, not a tagged wrapper.

use serde::{Deserialize, Serialize};

/// The longest string an argument echoes; a hostile template/params key
/// cannot blow up a diagnostic beyond this.
const MAX_ARG_CHARS: usize = 200;

/// One typed argument value: string, number, or boolean.
///
/// Untagged so it serializes to the bare scalar. Deserialize tries the
/// variants in declaration order, so `true`/`false` parse as [`ArgValue::Bool`],
/// any JSON number as [`ArgValue::Num`], and the rest as [`ArgValue::Str`].
///
/// Construct values through the `From` impls (what `Diagnostic::arg`
/// takes) or [`ArgValue::text`]/[`ArgValue::number`]: those apply the
/// sanitize/clip/finiteness guards. The variants stay public for
/// pattern-matching consumers, but building `Num`/`Str` directly
/// bypasses the guards — don't.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ArgValue {
    /// A boolean flag.
    Bool(bool),
    /// A finite number (non-finite inputs are clamped to 0).
    Num(f64),
    /// A sanitized, length-clipped string.
    Str(String),
}

impl ArgValue {
    /// Builds a string value, stripping control characters and clipping to
    /// [`MAX_ARG_CHARS`].
    pub fn text(s: &str) -> Self {
        ArgValue::Str(sanitize(s))
    }

    /// Builds a number value, forcing non-finite inputs to 0.
    pub fn number(n: f64) -> Self {
        ArgValue::Num(if n.is_finite() { n } else { 0.0 })
    }

    /// The English default rendering of this value, used to fill a
    /// message template. Numbers print without trailing-zero noise.
    pub(crate) fn render(&self) -> String {
        match self {
            ArgValue::Bool(b) => b.to_string(),
            ArgValue::Num(n) => fmt_num(*n),
            ArgValue::Str(s) => s.clone(),
        }
    }
}

/// Strips control characters (log/terminal-injection guard) and clips to a
/// bounded character count.
fn sanitize(s: &str) -> String {
    s.chars()
        .filter(|c| !c.is_control())
        .take(MAX_ARG_CHARS)
        .collect()
}

/// Renders a finite number for an English message: integers print without a
/// decimal point, fractions trim trailing zeros.
fn fmt_num(n: f64) -> String {
    if n.fract() == 0.0 && n.abs() < 1e15 {
        format!("{}", n as i64)
    } else {
        let s = format!("{n:.4}");
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

impl From<&str> for ArgValue {
    fn from(s: &str) -> Self {
        ArgValue::text(s)
    }
}
impl From<String> for ArgValue {
    fn from(s: String) -> Self {
        ArgValue::text(&s)
    }
}
impl From<&String> for ArgValue {
    fn from(s: &String) -> Self {
        ArgValue::text(s)
    }
}
impl From<bool> for ArgValue {
    fn from(b: bool) -> Self {
        ArgValue::Bool(b)
    }
}
impl From<f64> for ArgValue {
    fn from(n: f64) -> Self {
        ArgValue::number(n)
    }
}
impl From<usize> for ArgValue {
    fn from(n: usize) -> Self {
        ArgValue::number(n as f64)
    }
}
impl From<u64> for ArgValue {
    fn from(n: u64) -> Self {
        ArgValue::number(n as f64)
    }
}
impl From<i64> for ArgValue {
    fn from(n: i64) -> Self {
        ArgValue::number(n as f64)
    }
}
impl From<u32> for ArgValue {
    fn from(n: u32) -> Self {
        ArgValue::number(f64::from(n))
    }
}

#[cfg(test)]
#[path = "arg/tests.rs"]
mod tests;
