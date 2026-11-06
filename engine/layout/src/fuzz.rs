//! The link-URL harness the `link_url` fuzz target and the corpus replay
//! test both run.
//!
//! Layout is the trust boundary for a `link:` URL: the renderer writes
//! whatever URL the tree carries into a PDF `/URI` action. The gate that
//! decides is private to layout and reached only after a full layout pass,
//! so this module's `link_url`, which the fuzz target and the replay test
//! call, calls `check_link_url` directly and asserts, on every URL that
//! `check_link_url` accepts, the rule stated in `check_link_url`'s
//! documentation.
//!
//! Doc-hidden `pub` rather than feature-gated, for the reason
//! `shojiku_verify`'s fuzz module gives: a feature-gated entry point is
//! compiled by `clippy --all-features` but invisible to the coverage gate.
//! Nothing here is API.

use crate::engine::link::{MAX_LINK_URL, check_link_url};

#[cfg(test)]
mod tests;

/// The schemes a link URL may start with, compared ASCII-case-insensitively.
const ALLOWED_SCHEMES: [&str; 4] = ["http:", "https:", "mailto:", "tel:"];

/// Runs one fuzz input through the link-URL gate as an interpolated URL and
/// returns whether the gate accepted it.
///
/// # Panics
///
/// Panics when the gate accepts `input` and [`assert_link_rule`] fails.
pub fn link_url(input: &str) -> bool {
    let Ok(accepted) = check_link_url(input) else {
        return false;
    };
    assert_link_rule(input, accepted);
    true
}

/// Asserts the rule `check_link_url` documents for a URL it accepted.
///
/// # Panics
///
/// Panics when `accepted` is not `input` with surrounding whitespace
/// trimmed, is longer than `MAX_LINK_URL` bytes, contains a control
/// character (Unicode category `Cc`), or does not start with `http:`,
/// `https:`, `mailto:` or `tel:`.
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
        !accepted.chars().any(char::is_control),
        "the accepted URL contains a control character"
    );
    let lowered = accepted.to_ascii_lowercase();
    assert!(
        ALLOWED_SCHEMES
            .iter()
            .any(|scheme| lowered.starts_with(scheme)),
        "the accepted URL does not start with an allowed scheme"
    );
}
