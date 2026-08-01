//! What verification found — including what it did not look at.
//!
//! The omissions are a field, not a footnote. A "valid" verdict that quietly
//! skipped revocation is worse than no verifier at all: it turns a missing
//! capability into a false assurance, which is exactly the trust a signing
//! feature is selling. So [`VerificationReport::not_checked`] is populated on
//! a PASSING verification too, and it travels with the verdict wherever the
//! verdict goes.
//!
//! The four checks are separate fields rather than one verdict for the same
//! reason. "The signature is valid but it covers only part of the file" is a
//! different fact from "the signature is wrong", and a caller that cannot
//! tell them apart cannot explain the failure to anyone.

use serde::Serialize;

#[cfg(test)]
mod tests;

/// A check this release does not perform.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NotChecked {
    /// Whether the certificate has been revoked (OCSP / CRL). Needs network
    /// access, which the verification path does not have.
    Revocation,
    /// Whether a timestamp authority vouches for when the signature was
    /// made. Signatures this engine produces carry no signing time at all.
    Timestamp,
}

/// Every check this release omits, in a fixed order.
pub(crate) const NOT_CHECKED: &[NotChecked] = &[NotChecked::Revocation, NotChecked::Timestamp];

/// The outcome of one check.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum CheckOutcome {
    /// The check ran and the document satisfied it.
    Passed,
    /// The check ran and the document did not satisfy it.
    Failed {
        /// Names what was wrong. Bounded like every message in this crate:
        /// a fixed string, never a fragment of the document.
        reason: &'static str,
    },
}

impl CheckOutcome {
    /// A failure naming `reason`.
    #[must_use]
    pub(crate) fn failed(reason: &'static str) -> Self {
        Self::Failed { reason }
    }

    /// Whether this check passed.
    #[must_use]
    pub fn is_passed(&self) -> bool {
        matches!(self, Self::Passed)
    }
}

/// What verification established about a document.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationReport {
    valid: bool,
    signature: CheckOutcome,
    coverage: CheckOutcome,
    certificate_validity: CheckOutcome,
    trust_chain: CheckOutcome,
    not_checked: &'static [NotChecked],
}

impl VerificationReport {
    /// Assembles a report from the four checks.
    ///
    /// `valid` is computed here rather than by the caller so there is one
    /// place where "all four passed" is decided and no way for the verdict
    /// to drift from the checks it summarizes.
    pub(crate) fn new(
        signature: CheckOutcome,
        coverage: CheckOutcome,
        certificate_validity: CheckOutcome,
        trust_chain: CheckOutcome,
    ) -> Self {
        Self {
            valid: signature.is_passed()
                && coverage.is_passed()
                && certificate_validity.is_passed()
                && trust_chain.is_passed(),
            signature,
            coverage,
            certificate_validity,
            trust_chain,
            not_checked: NOT_CHECKED,
        }
    }

    /// Whether every check this release performs passed.
    #[must_use]
    pub fn is_valid(&self) -> bool {
        self.valid
    }

    /// Whether the signature verifies over the bytes the document declares
    /// are covered.
    #[must_use]
    pub fn signature(&self) -> CheckOutcome {
        self.signature
    }

    /// Whether those declared bytes are the whole document apart from the
    /// signature window. A valid signature over an incomplete range is a
    /// forgery, so this is a check of its own.
    #[must_use]
    pub fn coverage(&self) -> CheckOutcome {
        self.coverage
    }

    /// Whether every certificate involved was within its validity period.
    #[must_use]
    pub fn certificate_validity(&self) -> CheckOutcome {
        self.certificate_validity
    }

    /// Whether the signer's certificate chains to a caller-supplied anchor.
    #[must_use]
    pub fn trust_chain(&self) -> CheckOutcome {
        self.trust_chain
    }

    /// The checks this release does not perform.
    #[must_use]
    pub fn not_checked(&self) -> &'static [NotChecked] {
        self.not_checked
    }
}
