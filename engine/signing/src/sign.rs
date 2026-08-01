//! The two halves of signing a document, and the shortcut that joins them.
//!
//! [`prepare_sign`] reserves the signature window and reports the digest of
//! everything around it; [`complete_sign`] writes a finished signature into
//! that window. Between the two, the caller is free to do whatever producing a
//! signature requires — including nothing this crate knows about.
//!
//! The split is the reason a private key never has to enter this process, so
//! it is the primary path and [`sign_document`] is the convenience built on
//! top, not the other way round.

use ring::digest::{Context, SHA256};

use crate::cms::SignatureContainer;
use crate::error::{Result, SigningError};
use crate::placeholder::{append_signature_placeholder, PlaceholderOptions, PreparedPdf};
use crate::signer::Signer;

#[cfg(test)]
mod tests;

/// A document with its signature window reserved and its digest computed.
pub struct PreparedSign {
    prepared: PreparedPdf,
    digest: [u8; 32],
}

impl PreparedSign {
    /// The SHA-256 digest of every byte the signature covers.
    #[must_use]
    pub fn digest(&self) -> &[u8; 32] {
        &self.digest
    }

    /// The `/ByteRange` array the document carries.
    #[must_use]
    pub fn byte_range(&self) -> [usize; 4] {
        self.prepared.byte_range()
    }

    /// How many bytes of signature the reserved window holds.
    ///
    /// The window stores the signature as hexadecimal between two angle
    /// brackets, so it holds half as many bytes as it has characters.
    #[must_use]
    pub fn capacity(&self) -> usize {
        hex_field(&self.prepared).len() / 2
    }
}

/// Reserves a signature window in `pdf` and digests everything around it.
///
/// # Errors
///
/// Returns [`SigningError`] when `pdf` is not a document this release can
/// extend; the rejection names what was unsupported.
pub fn prepare_sign(pdf: &[u8], options: &PlaceholderOptions) -> Result<PreparedSign> {
    let prepared = append_signature_placeholder(pdf, options)?;
    let digest = digest_covered(&prepared)?;
    Ok(PreparedSign { prepared, digest })
}

/// Writes a finished signature container into the reserved window.
///
/// # Errors
///
/// Returns [`SigningError::SignatureTooLarge`] when the container does not fit
/// the reserved window, stating both sizes so the caller can re-prepare with a
/// large enough one.
pub fn complete_sign(prepared: PreparedSign, container_der: &[u8]) -> Result<Vec<u8>> {
    let field = hex_field(&prepared.prepared);
    let capacity = field.len() / 2;
    let needed = container_der.len();
    // The size check is the real guard, not a shortcut for one below: the
    // buffer continues past the window (the closing bracket, the rest of the
    // revision), so a container that overruns the field would otherwise land
    // on perfectly valid indices and corrupt the document instead of failing.
    if needed > capacity {
        return Err(SigningError::SignatureTooLarge { needed, capacity });
    }
    let mut bytes = prepared.prepared.into_bytes();
    // Written through a clamped iterator rather than by index: the write
    // cannot leave the field even if the sizes above ever stopped agreeing.
    // The window is pre-filled with ASCII zeros and only the leading
    // characters are overwritten — the trailing zeros stay, which is what
    // every PDF signature does, since a reader takes the container's length
    // from its own DER header and ignores the padding.
    let characters = container_der.iter().flat_map(|byte| hex_pair(*byte));
    for (slot, character) in bytes
        .iter_mut()
        .skip(field.start)
        .take(field.len())
        .zip(characters)
    {
        *slot = character;
    }
    Ok(bytes)
}

/// Signs `pdf` with `signer` in one call.
///
/// # Errors
///
/// Returns [`SigningError`] when the document cannot be extended, the
/// container cannot be built, the signer fails, or the signature does not fit
/// the reserved window.
pub fn sign_document(
    pdf: &[u8],
    signer: &dyn Signer,
    options: &PlaceholderOptions,
) -> Result<Vec<u8>> {
    let prepared = prepare_sign(pdf, options)?;
    let container = SignatureContainer::new(
        signer.certificate_pem(),
        prepared.digest(),
        signer.algorithm(),
    )?;
    let signature = signer.sign(&container.to_be_signed()?)?;
    complete_sign(prepared, &container.finish(&signature)?)
}

/// Digests the two signed ranges, in order, skipping the reserved window.
fn digest_covered(prepared: &PreparedPdf) -> Result<[u8; 32]> {
    let bytes = prepared.bytes();
    let [first_at, first_len, second_at, second_len] = prepared.byte_range();
    let mut context = Context::new(&SHA256);
    for (at, len) in [(first_at, first_len), (second_at, second_len)] {
        let end = at.checked_add(len).ok_or(SigningError::OutOfRange {
            offset: at,
            what: "a signed range that runs past the end of the address space",
        })?;
        let part = bytes.get(at..end).ok_or(SigningError::OutOfRange {
            offset: at,
            what: "a signed range that lies outside the prepared document",
        })?;
        context.update(part);
    }
    let mut digest = [0u8; 32];
    digest.copy_from_slice(context.finish().as_ref());
    Ok(digest)
}

/// The hexadecimal characters inside the window, without its angle brackets.
fn hex_field(prepared: &PreparedPdf) -> core::ops::Range<usize> {
    let span = prepared.contents_span();
    // The window is written as `<` + digits + `>`, so both ends are known to
    // be there; saturating arithmetic keeps a zero-length span honest rather
    // than wrapping if that ever stopped being true.
    span.start.saturating_add(1)..span.end.saturating_sub(1)
}

/// The two uppercase hexadecimal characters of one byte.
fn hex_pair(byte: u8) -> [u8; 2] {
    const DIGITS: &[u8; 16] = b"0123456789ABCDEF";
    [
        DIGITS[usize::from(byte >> 4)],
        DIGITS[usize::from(byte & 0x0f)],
    ]
}
