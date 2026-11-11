//! The fuzz harnesses of the layout crate: the link-URL gate (here) and
//! the text measurement the `text` fuzz group drives — line wrapping
//! (`wrap`), shaping (`shape`) and the overflow policies (`overflow`), over
//! the font chain `input` loads. Each fuzz target and its corpus replay test
//! call the same function, so CI runs the assertions the fuzzer does.
//!
//! Layout is the trust boundary for a `link:` URL: the renderer writes
//! whatever URL the tree carries into a PDF `/URI` action. The gate that
//! decides is private to layout and reached only after a full layout pass,
//! so this module's `link_url`, which the fuzz target and the replay test
//! call, calls `check_link_url` directly, returns which result
//! `check_link_url` gave, and asserts, on every URL that `check_link_url`
//! accepts, the rule stated in `check_link_url`'s documentation.
//!
//! Doc-hidden `pub` rather than feature-gated, for the reason
//! `shojiku_verify`'s fuzz module gives: a feature-gated entry point is
//! compiled by `clippy --all-features` but invisible to the coverage gate.
//! Nothing here is API.

use crate::engine::link::{LinkReject, MAX_LINK_URL, check_link_url};

#[cfg(test)]
mod tests;

mod input;
mod overflow;
mod shape;
mod wrap;

pub use input::text_chain;
pub use overflow::{OverflowPaths, overflow};
pub use shape::{ShapePaths, shape};
pub use wrap::{WrapPaths, wrap};

/// The schemes a link URL may start with, compared ASCII-case-insensitively.
const ALLOWED_SCHEMES: [&str; 4] = ["http:", "https:", "mailto:", "tel:"];

/// Which result `check_link_url` returned for one input, for the replay
/// test's positive and negative controls. Exactly one field is `true`, set from the result
/// `check_link_url` returned, never from inspecting the input string.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct LinkPaths {
    /// The gate accepted the URL, so the rule assertions ran.
    pub accepted: bool,
    /// Refused: empty after trimming.
    pub refused_empty: bool,
    /// Refused: over the length cap.
    pub refused_too_long: bool,
    /// Refused: contains a control character.
    pub refused_control: bool,
    /// Refused: scheme outside the allowlist.
    pub refused_scheme: bool,
    /// Refused: contains a character outside 7-bit ASCII.
    pub refused_not_ascii: bool,
}

/// Runs one fuzz input through the link-URL gate as an interpolated URL and
/// returns which result `check_link_url` gave.
///
/// # Panics
///
/// Panics when the gate accepts `input` and [`assert_link_rule`] fails.
pub fn link_url(input: &str) -> LinkPaths {
    let mut paths = LinkPaths::default();
    match check_link_url(input) {
        Ok(accepted) => {
            assert_link_rule(input, accepted);
            paths.accepted = true;
        }
        Err(LinkReject::Empty) => paths.refused_empty = true,
        Err(LinkReject::TooLong) => paths.refused_too_long = true,
        Err(LinkReject::Control) => paths.refused_control = true,
        Err(LinkReject::Scheme) => paths.refused_scheme = true,
        Err(LinkReject::NotAscii) => paths.refused_not_ascii = true,
    }
    paths
}

/// Asserts the rule `check_link_url` documents for a URL it accepted.
///
/// # Panics
///
/// Panics when `accepted` is not `input` with surrounding whitespace
/// trimmed, is longer than `MAX_LINK_URL` bytes, contains an ASCII control
/// character, contains a non-ASCII character, or does not start with
/// `http:`, `https:`, `mailto:` or `tel:`.
fn assert_link_rule(input: &str, accepted: &str) {
    assert_eq!(
        accepted,
        input.trim(),
        "the accepted URL is not the trimmed input"
    );
    assert!(
        accepted.len() <= MAX_LINK_URL,
        "the accepted URL is over the cap"
    );
    assert!(
        !accepted.bytes().any(|byte| byte.is_ascii_control()),
        "the accepted URL contains a control byte"
    );
    assert!(
        accepted.is_ascii(),
        "the accepted URL contains a non-ASCII character"
    );
    let lowered = accepted.to_ascii_lowercase();
    assert!(
        ALLOWED_SCHEMES
            .iter()
            .any(|scheme| lowered.starts_with(scheme)),
        "the accepted URL does not start with an allowed scheme"
    );
}
