//! Whose signature counts, and whether it counted at the time.
//!
//! **The trust anchor is always the caller's.** Verification never consults
//! the operating system's trust store, even though a native-certificate
//! crate is already in the dependency tree for TLS. Reaching for it would
//! make the verdict depend on ambient machine state — the property the
//! determinism posture rejects everywhere else — and would silently widen
//! who can vouch for a document. A caller who wants system trust passes
//! those roots in explicitly.
//!
//! **The clock is a parameter, not a hidden global.** Validity is inherently
//! time-dependent, so the time is an argument
//! ([`crate::verify_document_at`]) and the convenience entry point supplies
//! the system clock. That keeps an expired-certificate test deterministic
//! instead of dependent on when it runs.
//!
//! What this walk does NOT do is stated where it matters — the report's
//! `not_checked` list — and is worth naming here too: no revocation, no
//! timestamps, no name constraints, no extended-key-usage and no policy
//! processing. What it does check is that every issuer is marked as a
//! certificate authority, that each link's signature holds, and that the
//! chain reaches an anchor within a bounded number of steps.

use der::Encode;
use x509_cert::ext::pkix::BasicConstraints;
use x509_cert::Certificate;

use crate::error::{Result, VerifyError};
use crate::limits::MAX_TRUST_ANCHORS;
use crate::report::CheckOutcome;
use crate::signature::{verify_with, SignatureAlgorithm};

#[cfg(test)]
mod tests;

/// The certificates a caller is willing to trust.
#[derive(Debug, Clone)]
pub struct TrustAnchors {
    certificates: Vec<Certificate>,
}

impl TrustAnchors {
    /// Reads anchors from PEM holding one or more `CERTIFICATE` blocks.
    ///
    /// # Errors
    ///
    /// Returns [`VerifyError::AnchorNotPem`] when the input is not PEM
    /// certificates, [`VerifyError::NoTrustAnchors`] when it holds none, and
    /// [`VerifyError::LimitExceeded`] past [`MAX_TRUST_ANCHORS`].
    pub fn from_pem(pem: &[u8]) -> Result<Self> {
        // The emptiness check is a GUARD, not a shortcut: the decoder below
        // computes `input.len() - 1` after stripping trailing newlines, so an
        // empty or whitespace-only file underflows — a panic in debug builds
        // and a wrapped comparison in release ones. The anchor file is
        // caller-supplied, and no input this crate is handed may reach a
        // panicking path.
        if pem.iter().all(u8::is_ascii_whitespace) {
            return Err(VerifyError::NoTrustAnchors);
        }
        // Counted BEFORE decoding, not after. `load_pem_chain` decodes every
        // block it is given, so a cap applied to the result would first do
        // the work the cap exists to refuse. Counting the opening lines is a
        // single linear scan, and it can only OVERCOUNT (a block with no
        // `END` line decodes to nothing), so passing it guarantees the
        // decoded set is within the limit too.
        if count_blocks(pem) > MAX_TRUST_ANCHORS {
            return Err(VerifyError::LimitExceeded {
                what: "trust anchors",
                cap: MAX_TRUST_ANCHORS,
            });
        }
        let certificates =
            Certificate::load_pem_chain(pem).map_err(|_| VerifyError::AnchorNotPem)?;
        Self::new(certificates)
    }

    /// Builds anchors from already-decoded certificates.
    fn new(certificates: Vec<Certificate>) -> Result<Self> {
        if certificates.is_empty() {
            return Err(VerifyError::NoTrustAnchors);
        }
        Ok(Self { certificates })
    }

    /// The anchors, in the order they were supplied.
    fn as_slice(&self) -> &[Certificate] {
        &self.certificates
    }
}

/// Counts the `CERTIFICATE` blocks a PEM input opens.
fn count_blocks(pem: &[u8]) -> usize {
    let opening = b"-----BEGIN CERTIFICATE-----";
    pem.windows(opening.len())
        .filter(|window| *window == opening)
        .count()
}

/// Builds the chain from `signer` to an anchor, and reports both checks.
///
/// The two checks are independent on purpose: an expired certificate whose
/// chain also fails reports BOTH, rather than the first failure hiding the
/// second. A caller reading a report should not have to fix one problem to
/// discover the next.
pub(crate) fn check<'a>(
    signer: &'a Certificate,
    others: &'a [Certificate],
    anchors: &'a TrustAnchors,
    at_unix_seconds: u64,
) -> (CheckOutcome, CheckOutcome) {
    let (chain, trust) = match walk(signer, others, anchors) {
        Ok(chain) => (chain, CheckOutcome::Passed),
        // The chain could not be completed, so validity is judged over what
        // was established: at minimum the signer's own certificate.
        Err(reason) => (vec![signer], CheckOutcome::failed(reason)),
    };
    (validity(&chain, at_unix_seconds), trust)
}

/// Follows issuers from `signer` until an anchor is reached.
///
/// The walk terminates without needing a depth constant, and the argument is
/// worth stating because "bounded" is a claim this crate has to make good on.
/// Every issuer comes from the anchors or the container, both capped at
/// construction, and a certificate already in the chain ends the walk — so
/// the number of steps cannot exceed the size of that pool. A chain that
/// closes on itself is not a special error either: it simply goes no
/// further, and it never reached an anchor, which is what the caller is told.
fn walk<'a>(
    signer: &'a Certificate,
    others: &'a [Certificate],
    anchors: &'a TrustAnchors,
) -> core::result::Result<Vec<&'a Certificate>, &'static str> {
    const UNTRUSTED: &str = "the certificate chain does not reach a supplied trust anchor";
    let mut chain = vec![signer];
    let mut seen = vec![encoded(signer)];
    let mut current = signer;
    loop {
        if is_anchor(current, anchors) {
            return Ok(chain);
        }
        let issuer = find_issuer(current, others, anchors).ok_or(UNTRUSTED)?;
        let issuer_der = encoded(issuer);
        if seen.contains(&issuer_der) {
            return Err(UNTRUSTED);
        }
        seen.push(issuer_der);
        chain.push(issuer);
        current = issuer;
    }
}

/// A certificate's DER, or an empty vector when it cannot be re-encoded.
///
/// Only ever used to compare two certificates for identity, so a certificate
/// that fails to encode simply matches nothing — including itself, which is
/// the safe direction: it can neither be an anchor nor end a walk early.
fn encoded(certificate: &Certificate) -> Vec<u8> {
    certificate.to_der().unwrap_or_default()
}

/// Whether `certificate` is itself one of the anchors.
fn is_anchor(certificate: &Certificate, anchors: &TrustAnchors) -> bool {
    // Compared as DER, which is the only identity that means anything here:
    // two certificates with the same subject are not the same certificate.
    let der = encoded(certificate);
    !der.is_empty()
        && anchors
            .as_slice()
            .iter()
            .any(|anchor| encoded(anchor) == der)
}

/// The certificate that issued `child`, from the anchors or the container.
///
/// A candidate qualifies only if it is marked as a certificate authority AND
/// its key actually verifies `child`'s signature — name chaining alone would
/// let anyone who copies a subject name into their issuer field insert
/// themselves into a chain.
fn find_issuer<'a>(
    child: &Certificate,
    others: &'a [Certificate],
    anchors: &'a TrustAnchors,
) -> Option<&'a Certificate> {
    // A name that cannot be re-encoded comes back empty and therefore
    // matches nothing — the safe direction, and one line rather than a
    // defensive branch no input can reach.
    let issuer_name = child.tbs_certificate.issuer.to_der().unwrap_or_default();
    anchors
        .as_slice()
        .iter()
        .chain(others.iter())
        .find(|candidate| {
            let subject = candidate
                .tbs_certificate
                .subject
                .to_der()
                .unwrap_or_default();
            !issuer_name.is_empty()
                && subject == issuer_name
                && is_authority(candidate)
                && issued(child, candidate)
        })
}

/// Whether a certificate's basic constraints mark it as an authority.
fn is_authority(certificate: &Certificate) -> bool {
    certificate
        .tbs_certificate
        .get::<BasicConstraints>()
        .ok()
        .flatten()
        .is_some_and(|(_critical, constraints)| constraints.ca)
}

/// Whether `issuer`'s key verifies `child`'s signature.
///
/// The signed bytes are the re-encoded `TBSCertificate`. Re-encoding is safe
/// for anything that was DER to begin with — which every conformant
/// certificate is — and a non-canonical encoding simply fails to verify
/// rather than being accepted on a guess.
fn issued(child: &Certificate, issuer: &Certificate) -> bool {
    checked(child, issuer).is_some()
}

/// The four things that must all work for `issued` to say yes.
///
/// Written as one `?` chain rather than four early returns so that a step
/// nobody can make fail — re-encoding a structure that was just parsed —
/// does not become a branch with no test behind it.
fn checked(child: &Certificate, issuer: &Certificate) -> Option<()> {
    let algorithm = SignatureAlgorithm::from_certificate_oid(child.signature_algorithm.oid).ok()?;
    let tbs = child.tbs_certificate.to_der().ok()?;
    let signature = child.signature.as_bytes()?;
    verify_with(issuer, algorithm, &tbs, signature).ok()
}

/// Checks every certificate in `chain` against `at_unix_seconds`.
fn validity(chain: &[&Certificate], at_unix_seconds: u64) -> CheckOutcome {
    for certificate in chain {
        let validity = &certificate.tbs_certificate.validity;
        if at_unix_seconds < validity.not_before.to_unix_duration().as_secs() {
            return CheckOutcome::failed("a certificate in the chain is not yet valid");
        }
        if at_unix_seconds > validity.not_after.to_unix_duration().as_secs() {
            return CheckOutcome::failed("a certificate in the chain has expired");
        }
    }
    CheckOutcome::Passed
}
