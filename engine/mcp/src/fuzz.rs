//! The fuzz harnesses of the MCP server, which the `mcp_frames` and
//! `mcp_uri` fuzz targets of the `host` group
//! (`make engine:fuzz FUZZ_GROUP=host`) call: the stdio transport from
//! bytes to responses (`frames`), and the `shojiku://reference/…` and
//! `shojiku://example/…` URIs through `resources/read` (`uri`). Each fuzz
//! target and its corpus replay test call the same function, so CI runs
//! the assertions the fuzzer does.
//!
//! Doc-hidden `pub` rather than feature-gated, for the reason
//! `shojiku_verify`'s fuzz module gives: a feature-gated entry point is
//! compiled by `clippy --all-features` but invisible to the coverage gate.
//! Nothing here is API.

mod frames;
mod uri;

pub use frames::{FramePaths, frames};
pub use uri::{UriPaths, uri};

/// The most characters an MCP error message adds around the part of the
/// input it echoes. The text of every such message other than the echoed
/// part is at most this long (the longest names the per-file URIs of one
/// bundled example), so a message longer than `MAX_ECHO` plus this echoes
/// more of the input than the guard allows.
const MAX_FIXED_TEXT: usize = 1024;

/// Asserts that `message` holds no character the echo guard strips and is
/// at most `MAX_ECHO` + `fixed` characters, whatever the length of
/// `input`. `fixed` is the most characters the message adds around the
/// echoed part of the input: [`MAX_FIXED_TEXT`] when the message is one of
/// many sentences, or the length of the fixed text of the one sentence the
/// message is (for the unknown-method message, its `unknown method: `
/// prefix).
///
/// # Panics
///
/// Panics when either assertion fails; the message names it.
fn assert_bounded_echo(message: &str, input: &str, fixed: usize) {
    use shojiku_diagnostics::{MAX_ECHO, sanitize};
    assert_eq!(
        sanitize(message, usize::MAX),
        message,
        "an error message holds a character the echo guard strips"
    );
    let length = message.chars().count();
    assert!(
        length <= MAX_ECHO + fixed,
        "an error message of {length} characters for an input of {} echoes more than {MAX_ECHO} of them",
        input.chars().count()
    );
}

#[cfg(test)]
mod tests;
