//! `shojiku_verify`: a signed PDF and a trust anchor in, a report out.
//!
//! Two decisions shape this operation, and both exist to stop a caller from
//! reading a false assurance out of it.
//!
//! **`success` is the verdict, not "a report came back".** A binding that
//! checks only `success` on a document whose signature does not verify would
//! otherwise be told everything is fine. Fail-closed is the only direction a
//! verification API may lean.
//!
//! **The report rides on the result whichever way the verdict went.** It
//! names the checks this release does NOT perform, and dropping that on the
//! way through a binding is exactly how a missing capability turns into a
//! promise nobody made. So a failed verdict carries the full report AND an
//! error object naming the first check that failed.
//!
//! Anchors are required. The verifier never consults the machine's trust
//! store, so there is nothing to default to — a `verify` that silently
//! trusted whatever the operating system trusts would answer a different
//! question than the one the caller asked.

use crate::result::ShojikuResult;
use crate::status::{encode, Failure};
use shojiku_diagnostics::Diagnostics;
use shojiku_verify::{verify_document, CheckOutcome, TrustAnchors, VerificationReport};

/// Verifies `pdf` against `anchors`.
pub(crate) fn run(pdf: &[u8], anchors: &[u8]) -> Result<ShojikuResult, Failure> {
    let anchors =
        TrustAnchors::from_pem(anchors).map_err(|err| Failure::host("verify", "anchors", &err))?;
    let report =
        verify_document(pdf, &anchors).map_err(|err| Failure::host("verify", "document", &err))?;
    let json = encode(&report);
    let Some((kind, reason)) = failed_check(&report) else {
        // Verification emits no diagnostics of its own; the empty list keeps
        // every operation's result the same shape for an SDK to read.
        return Ok(ShojikuResult::json_and_diagnostics(
            json,
            encode(&Diagnostics::new()),
        ));
    };
    // Rendered through `Failure` rather than by hand, so the failed verdict
    // reaches the caller as the same `{step, kind, message}` object every
    // other refusal on this surface uses.
    let failure = Failure::Host {
        step: "verify",
        kind,
        message: reason.to_string(),
    };
    Ok(failure.into_result().with_json(json))
}

/// The first check the report says did not pass, in the report's own order.
///
/// One name is what a binding shows; the whole report is what it inspects.
/// Scanning in a fixed order means two runs over the same document always
/// blame the same check.
fn failed_check(report: &VerificationReport) -> Option<(&'static str, &'static str)> {
    let checks = [
        ("signature", report.signature()),
        ("coverage", report.coverage()),
        ("certificate_validity", report.certificate_validity()),
        ("trust_chain", report.trust_chain()),
    ];
    checks
        .into_iter()
        .find_map(|(name, outcome)| match outcome {
            CheckOutcome::Passed => None,
            CheckOutcome::Failed { reason } => Some((name, reason)),
        })
}
