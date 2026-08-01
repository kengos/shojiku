//! Measuring an RSA key so a rejection can name its size.
//!
//! The backend refuses a modulus outside its signing range, but it refuses it
//! opaquely — the caller learns only that the key was unusable. That is a poor
//! answer for the one mistake a caller can actually act on, so the modulus is
//! measured here first and the bounds are checked with the number in hand.
//!
//! The bounds are the backend's, read from the pinned version's own source
//! rather than remembered, and they are the SIGNING bounds specifically: the
//! verification range is wider at the top, so a key large enough to be refused
//! here can still verify documents someone else signed.

use der::asn1::UintRef;
use der::{Decode, Header, SliceReader, Tag};

use super::error::KeyError;

/// Smallest modulus the backend signs with.
pub const MIN_RSA_MODULUS_BITS: usize = 2047;

/// Largest modulus the backend signs with.
pub const MAX_RSA_MODULUS_BITS: usize = 4096;

/// Checks an RSA private key's modulus against the signing bounds.
pub(crate) fn check_rsa_modulus(rsa_private_key: &[u8]) -> Result<(), KeyError> {
    let bits = modulus_bits(rsa_private_key)?;
    if bits < MIN_RSA_MODULUS_BITS {
        return Err(KeyError::RsaModulusTooSmall {
            bits,
            min: MIN_RSA_MODULUS_BITS,
        });
    }
    if bits > MAX_RSA_MODULUS_BITS {
        return Err(KeyError::RsaModulusTooLarge {
            bits,
            max: MAX_RSA_MODULUS_BITS,
        });
    }
    Ok(())
}

/// Reads the modulus size out of a PKCS#1 `RSAPrivateKey`.
///
/// ```text
/// RSAPrivateKey ::= SEQUENCE {
///     version           INTEGER,
///     modulus           INTEGER,  -- n
///     publicExponent    INTEGER,  -- e
///     ... seven more fields this does not read
/// }
/// ```
///
/// The sequence header is decoded by hand rather than through the reader's
/// `sequence` helper because that helper requires the closure to consume the
/// whole body, and only the first two fields are wanted.
fn modulus_bits(der: &[u8]) -> Result<usize, KeyError> {
    let mut reader = SliceReader::new(der).map_err(|_| KeyError::Malformed)?;
    let header = Header::decode(&mut reader).map_err(|_| KeyError::Malformed)?;
    if header.tag != Tag::Sequence {
        return Err(KeyError::Malformed);
    }
    let _version = UintRef::decode(&mut reader).map_err(|_| KeyError::Malformed)?;
    let modulus = UintRef::decode(&mut reader).map_err(|_| KeyError::Malformed)?;
    Ok(bit_length(modulus.as_bytes()))
}

/// Bit length of a big-endian unsigned integer with leading zeros stripped.
///
/// A pure function over a parsed value, so its edge — an integer whose
/// encoding is a single zero byte — is testable without crafting a key.
fn bit_length(be: &[u8]) -> usize {
    let Some((first, rest)) = be.split_first() else {
        return 0;
    };
    let head = 8usize.saturating_sub(first.leading_zeros() as usize);
    rest.len().saturating_mul(8).saturating_add(head)
}

#[cfg(test)]
mod tests;
