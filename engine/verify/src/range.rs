//! The check that a valid signature is not still a forgery.
//!
//! A PDF admits appended revisions, so a document can carry a
//! cryptographically perfect signature that covers only the ORIGINAL bytes
//! while a later revision changes what a reader sees. Verifying the
//! signature does not catch that — the signature is genuinely valid over the
//! bytes it claims. What catches it is establishing that the claimed bytes
//! are the whole file apart from the signature window, which is what this
//! module does.
//!
//! It is a check of its own, reported in its own field, precisely so the
//! failure is distinguishable from a bad signature. "Valid signature,
//! incomplete coverage" and "wrong signature" are different accusations.

use core::ops::Range;

use shojiku_signing::{array_elements, parse_uint, Dict};

use crate::error::{Result, VerifyError};
use crate::report::CheckOutcome;

#[cfg(test)]
mod tests;

/// The four `/ByteRange` fields: two `(offset, length)` pairs.
pub(crate) type ByteRange = [usize; 4];

/// Reads the `/ByteRange` array a signature declares.
///
/// A malformed array is an `Err` rather than a failed check: a document that
/// does not state which bytes it signed has not made a claim to disprove.
/// A well-formed array that states the WRONG bytes is a verdict, and that is
/// [`check_coverage`]'s job.
pub(crate) fn parse_byte_range(dict: &Dict<'_>) -> Result<ByteRange> {
    let raw = dict.get(b"ByteRange").ok_or(VerifyError::Malformed {
        what: "a /ByteRange entry in the signature dictionary",
    })?;
    let elements = array_elements(raw, "the signature's /ByteRange")?;
    let mut range: ByteRange = [0; 4];
    if elements.len() != range.len() {
        return Err(VerifyError::Malformed {
            what: "a /ByteRange array of exactly four fields",
        });
    }
    for (slot, element) in range.iter_mut().zip(elements) {
        // `parse_uint` accepts unsigned decimals only, so a negative field
        // fails here rather than wrapping into an enormous length.
        let value = parse_uint(element, "a /ByteRange field")?;
        // Saturating rather than erroring is safe BECAUSE it saturates to a
        // value no document can satisfy: a range of `usize::MAX` fails both
        // the coverage equalities and the bounds check on the buffer. On a
        // 64-bit target the conversion never loses anything anyway; this is
        // what keeps the narrower ones honest instead of unreachable.
        *slot = usize::try_from(value).unwrap_or(usize::MAX);
    }
    Ok(range)
}

/// Checks that `range` covers the whole document except the signature
/// window.
///
/// The four equalities below are the entire rule, and each names its own
/// failure so a caller learns which end of the claim was wrong.
pub(crate) fn check_coverage(
    range: ByteRange,
    contents: &Range<usize>,
    total: usize,
) -> CheckOutcome {
    let [first_at, first_len, second_at, second_len] = range;
    if first_at != 0 {
        return CheckOutcome::failed(
            "the signed range does not start at the beginning of the file",
        );
    }
    // The first range starts at zero — established above — so it ends at its
    // own length and there is no sum here to overflow. The second range's
    // offset is attacker-chosen, which is why that one is checked.
    if first_len != contents.start {
        return CheckOutcome::failed("the signed range does not run up to the signature window");
    }
    if second_at != contents.end {
        return CheckOutcome::failed(
            "the signed range does not resume immediately after the signature window",
        );
    }
    let Some(second_end) = second_at.checked_add(second_len) else {
        return CheckOutcome::failed(
            "the second signed range runs past the end of the address space",
        );
    };
    if second_end != total {
        // The appended-revision forgery lands here: everything up to the
        // signature checks out, and the file simply continues past what was
        // signed.
        return CheckOutcome::failed("the signed range does not reach the end of the file");
    }
    CheckOutcome::Passed
}

/// The bytes `range` covers, concatenated in order.
///
/// `None` when the ranges do not lie inside the document — the signature
/// then cannot be computed at all, which the caller reports as its own
/// failure rather than folding into the coverage verdict.
pub(crate) fn covered_bytes(pdf: &[u8], range: ByteRange) -> Option<Vec<u8>> {
    let [first_at, first_len, second_at, second_len] = range;
    let mut covered = Vec::new();
    for (at, len) in [(first_at, first_len), (second_at, second_len)] {
        let end = at.checked_add(len)?;
        covered.extend_from_slice(pdf.get(at..end)?);
    }
    Some(covered)
}
