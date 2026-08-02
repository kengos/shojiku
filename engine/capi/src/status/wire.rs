//! How a [`Failure`] renders for the caller, and the JSON encoder the whole
//! crate shares.
//!
//! Every failure — caller misuse and engine refusal alike — becomes the same
//! three-key object, so an SDK writes one mapping rather than one per status
//! code:
//!
//! ```json
//! { "step": "sign", "kind": "key", "message": "…" }
//! ```
//!
//! `step` names the lifecycle stage that failed (the SDK trace's step),
//! `kind` is a stable machine-readable class, and `message` is prose that is
//! ALWAYS bounded: engine errors quote paths and file content, and this is
//! the boundary that stops hostile input from riding out through an error.

use super::Failure;
use serde::Serialize;
use serde_json::{json, Value};

/// Longest message echoed back through `error_json`.
const MAX_MESSAGE: usize = 400;

impl Failure {
    /// The `{step, kind, message}` object the caller reads off the handle.
    pub(super) fn error_json(&self) -> String {
        let (step, kind, message) = self.parts();
        json!({ "step": step, "kind": kind, "message": clip(&message) }).to_string()
    }

    /// The three pieces, before bounding.
    fn parts(&self) -> (&str, &str, String) {
        match self {
            Failure::NullArg(what) => (
                "call",
                "null_argument",
                format!("`{what}` must not be null"),
            ),
            Failure::InvalidUtf8(what) => (
                "call",
                "invalid_utf8",
                format!("`{what}` is not valid UTF-8"),
            ),
            Failure::InvalidRequest(message) => ("request", "invalid_request", message.clone()),
            Failure::TooLarge { what, len, max } => (
                "call",
                "too_large",
                format!("`{what}` is {len} bytes, over the {max}-byte cap"),
            ),
            Failure::OutOfRange { index, total } => (
                "call",
                "out_of_range",
                format!("page index {index} is past the last page of {total}"),
            ),
            Failure::Panic(message) => ("panic", "panic", message.clone()),
            Failure::Host {
                step,
                kind,
                message,
            } => (step, kind, message.clone()),
            Failure::Document { step, .. } => (
                step,
                "document",
                "the engine refused this document; see the diagnostics".to_string(),
            ),
        }
    }
}

/// Bounds an echoed message: no control characters, no unbounded length.
/// Hostile content reaches here (a template path inside an engine error), so
/// this is a guard, not cosmetics.
pub(crate) fn clip(message: &str) -> String {
    message
        .chars()
        .filter(|c| !c.is_control())
        .take(MAX_MESSAGE)
        .collect()
}

/// Serializes a value for the wire.
///
/// Infallible by signature, and honestly so: what crosses this boundary is
/// diagnostics and engine info — strings, numbers and maps — and `serde_json`
/// does not refuse those. It does not refuse a non-finite float either; it
/// writes `null`. So the fallback is EAGER (`unwrap_or`, not `unwrap_or_else`):
/// an error arm here would be a line no input could ever reach, and a lazy one
/// would hide that behind a closure the coverage gate then reds.
pub(crate) fn encode<T: Serialize>(value: &T) -> String {
    serde_json::to_value(value)
        .unwrap_or(Value::Null)
        .to_string()
}

#[cfg(test)]
mod tests;
