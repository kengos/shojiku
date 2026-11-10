//! The fuzz harnesses of the box-model crate, which the fuzz targets of
//! the `box` group (`make engine:fuzz FUZZ_GROUP=box`) call: the flex
//! distribution (`flex`), and length resolution with the grid track math
//! (`resolve`). Each fuzz target and its corpus replay test call the same
//! function, so CI runs the assertions the fuzzer does.
//!
//! Both inputs are text, one value per whitespace-separated token, so a
//! seed is readable and a number can be written as `NaN`, `inf` or `1e308`
//! (the spellings `f64`'s parser accepts). The harnesses pass, on purpose,
//! values the template parser refuses: `resolve_flex_lengths`,
//! `grow_shares` and the spacing functions are documented to stay finite
//! for such values. Blank lines are skipped, so a seed's final newline adds
//! no item.
//!
//! Each harness returns which assertions an input checked on a result a
//! no-op engine would not give: a flag is set only where the asserted
//! property, applied to what the engine would return without the branch
//! under test, would fail. The corpus replay requires every flag of some
//! seed, so no assertion that has a flag is checked only against inputs
//! it passes vacuously; the finiteness, determinism and share-bound
//! assertions have no flag. The one input-derived flag,
//! `FlexPaths::hostile`, marks an input outside the caller range: the
//! assertions it guards hold for any input, so the flag is set from the
//! input alone, as no result of the engine marks an input as hostile.
//!
//! Doc-hidden `pub` rather than feature-gated, for the reason
//! `shojiku_verify`'s fuzz module gives: a feature-gated entry point is
//! compiled by `clippy --all-features` but invisible to the coverage gate.
//! Nothing here is API.

mod flex;
mod resolve;

pub use flex::{FlexPaths, flex};
pub use resolve::{ResolvePaths, resolve};

use crate::MAX_RESOLVED_PT;

/// The most item or length lines one input may hold. The flex resolution
/// is quadratic in its item count, so the cap bounds one input's cost.
const MAX_LINES: usize = 64;

/// Parses one number token; `-`, and anything `f64` cannot parse, is
/// `None`.
fn number(token: &str) -> Option<f64> {
    token.parse().ok()
}

/// The value of the `key=<value>` token in `line`, if present.
fn setting<'a>(line: &'a str, key: &str) -> Option<&'a str> {
    line.split_whitespace()
        .filter_map(|token| token.split_once('='))
        .find(|(k, _)| *k == key)
        .map(|(_, v)| v)
}

/// Whether `v` is a value a caller can pass: finite and within
/// [`MAX_RESOLVED_PT`] of zero, the range every resolved length is held to.
fn in_range(v: f64) -> bool {
    v.is_finite() && v.abs() <= MAX_RESOLVED_PT
}

/// Asserts that `got` is at most `limit`, allowing a relative error of 1e-9
/// of the larger of `limit`'s magnitude and 1.
///
/// # Panics
///
/// Panics with `what` when `got` is larger.
fn assert_at_most(got: f64, limit: f64, what: &str) {
    assert!(
        got <= limit + limit.abs().max(1.0) * 1e-9,
        "{what}: {got} is over {limit}"
    );
}

/// The non-blank lines of `input` after its first, up to [`MAX_LINES`].
fn body_lines(input: &str) -> impl Iterator<Item = &str> {
    input
        .split('\n')
        .skip(1)
        .filter(|line| !line.trim().is_empty())
        .take(MAX_LINES)
}

/// Whether `got` equals `want` within a relative error of 1e-9 of the
/// largest of their magnitudes, `scale` and 1. `scale` is the magnitude of
/// the values the result was computed from: subtracting nearly equal large
/// values loses precision in proportion to them, not to the result.
fn close(got: f64, want: f64, scale: f64) -> bool {
    let scale = got.abs().max(want.abs()).max(scale.abs()).max(1.0);
    (got - want).abs() <= scale * 1e-9
}

/// Asserts [`close`]`(got, want, scale)`.
///
/// # Panics
///
/// Panics with `what` when they differ by more.
fn assert_close(got: f64, want: f64, scale: f64, what: &str) {
    assert!(close(got, want, scale), "{what}: {got} is not {want}");
}

#[cfg(test)]
mod tests;
