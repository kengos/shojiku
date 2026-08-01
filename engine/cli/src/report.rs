//! The `--report <path>` sidecar: what a lifecycle operation did, as JSON.
//!
//! This exists for the SUBPROCESS SDKs (php, go). The other five load
//! `engine/capi` and read a result handle; these two script this binary,
//! and stderr prose is not a contract — an SDK cannot recover a
//! diagnostic's `code` or its typed `args` from `shojiku: warning[…] …`,
//! and nothing on the wire carries a render's page count or tells caller
//! error apart from a refused document.
//!
//! So the shape here MIRRORS the capi's result model rather than inventing
//! a second vocabulary: `diagnostics` is the `Diagnostics` value itself
//! (an `{"items": […]}` object, which is what the shipped SDKs already
//! parse), `pageCount` keeps its capi spelling, and `failure` is the capi's
//! `{step, kind, message}` object plus the `class` that its status code
//! carries out of band.
//!
//! It is purely additive: without the flag nothing here runs, and the
//! binary's stdout, stderr and exit codes are untouched.

use crate::error::{CliError, FailureClass};
use serde::Serialize;
use shojiku_diagnostics::Diagnostics;
use shojiku_verify::VerificationReport;
use std::path::Path;

/// Longest failure message the report echoes, matching the capi's cap.
const MAX_MESSAGE: usize = 400;

/// One operation's outcome.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report<'a> {
    /// Whether the operation produced what was asked for.
    ok: bool,
    /// The engine's diagnostics — ALWAYS present, because a document that
    /// rendered successfully can still have warned, and a caller who only
    /// inspects failures would never see it.
    diagnostics: &'a Diagnostics,
    /// Pages the render laid out. Absent for `sign` and `verify`: signing
    /// appends a revision to bytes it never laid out, and zero would read
    /// as "a document with no pages".
    #[serde(skip_serializing_if = "Option::is_none")]
    page_count: Option<usize>,
    /// The verification report, on `verify` only. Present on a FAILING
    /// verdict too — what was not checked has to reach the caller either
    /// way.
    #[serde(skip_serializing_if = "Option::is_none")]
    verification: Option<&'a VerificationReport>,
    /// Why the operation did not produce it. Absent when `ok`.
    #[serde(skip_serializing_if = "Option::is_none")]
    failure: Option<Failure>,
}

/// The cause, in the capi's three keys plus the level.
#[derive(Debug, Serialize)]
pub struct Failure {
    /// Caller error, or something the document did.
    class: FailureClass,
    /// The lifecycle step that ran. An SDK replaces this with its OWN
    /// step name — the contract is that `step` means one thing in a
    /// trace, and `kind` is what the engine said.
    step: &'static str,
    /// Stable machine-readable class; see `CliError::kind`.
    kind: &'static str,
    /// Prose, ALWAYS bounded — see [`clip`].
    message: String,
}

impl<'a> Report<'a> {
    /// A successful operation.
    pub fn success(diagnostics: &'a Diagnostics) -> Self {
        Self {
            ok: true,
            diagnostics,
            page_count: None,
            verification: None,
            failure: None,
        }
    }

    /// A failed operation, classified from the error `step` produced.
    pub fn failed(step: &'static str, error: &CliError, diagnostics: &'a Diagnostics) -> Self {
        Self {
            ok: false,
            diagnostics,
            page_count: None,
            verification: None,
            failure: Some(Failure {
                class: error.class(),
                step,
                kind: error.kind(),
                message: clip(&error.to_string()),
            }),
        }
    }

    /// Adds a render's page count.
    #[must_use]
    pub fn with_page_count(mut self, pages: usize) -> Self {
        self.page_count = Some(pages);
        self
    }

    /// Adds the verification report, on either verdict.
    #[must_use]
    pub fn with_verification(mut self, report: &'a VerificationReport) -> Self {
        self.verification = Some(report);
        self
    }

    /// Writes the report to `path`.
    ///
    /// Serialized whole and written in one call: a half-written file is
    /// what an SDK would surface as malformed output, which is a worse
    /// answer than the failure it was trying to describe.
    ///
    /// # Errors
    ///
    /// Returns [`CliError::Output`] when the path cannot be written.
    pub fn write(&self, path: &Path) -> Result<(), CliError> {
        let json = serde_json::to_string(self)?;
        std::fs::write(path, json).map_err(|source| CliError::Output {
            path: path.display().to_string(),
            source,
        })
    }
}

/// Bounds an echoed message: no control characters, no unbounded length.
///
/// Hostile content reaches here — an engine error quotes template paths and
/// file content — and this report is read by SDKs that put the message in
/// result objects, exception reporters and log aggregators. So this is the
/// same guard the capi applies at its own boundary, not cosmetics.
/// Diagnostics themselves pass through as the engine emitted them, exactly
/// as they do through the capi, which bounds its own echoed values.
fn clip(message: &str) -> String {
    message
        .chars()
        .filter(|c| !c.is_control())
        .take(MAX_MESSAGE)
        .collect()
}

#[cfg(test)]
mod tests;
