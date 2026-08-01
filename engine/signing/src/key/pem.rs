//! Turning private-key PEM text into PKCS#8 DER.
//!
//! Two supported shapes, and one refused by name. `PRIVATE KEY` is PKCS#8 as
//! it stands; `ENCRYPTED PRIVATE KEY` is PKCS#8 wrapped in PBES2 and is
//! decrypted here so a caller never has to keep an unencrypted key on disk.
//! The legacy OpenSSL "traditional" form is rejected with the one-line
//! conversion that fixes it.
//!
//! That legacy check runs BEFORE the PEM decoder, not after, and the ordering
//! is load-bearing: an encrypted traditional key carries `Proc-Type:` and
//! `DEK-Info:` headers, which RFC 7468 does not permit, so the decoder fails
//! on it with a generic parse error. Checked afterwards, the caller would be
//! told "not PEM" about a file that plainly is one.

use pkcs8::{EncryptedPrivateKeyInfo, SecretDocument};

use super::error::KeyError;

/// PEM labels that mean "a private key, but not in the format we read".
///
/// Each is an OpenSSL "traditional" (pre-PKCS#8) key. They are listed rather
/// than inferred so an unfamiliar label still reports as an unknown label
/// instead of being guessed at.
const LEGACY_LABELS: [&str; 3] = ["RSA PRIVATE KEY", "EC PRIVATE KEY", "DSA PRIVATE KEY"];

/// Decodes key PEM into PKCS#8 DER, decrypting it when it is encrypted.
///
/// The returned document zeroizes itself when dropped.
pub(crate) fn decode_pkcs8(
    pem: &[u8],
    passphrase: Option<&[u8]>,
) -> Result<SecretDocument, KeyError> {
    let text = core::str::from_utf8(pem).map_err(|_| KeyError::NotPem)?;
    if is_legacy(text) {
        return Err(KeyError::LegacyPem);
    }
    let (label, document) = SecretDocument::from_pem(text).map_err(|_| KeyError::NotPem)?;
    match label {
        "PRIVATE KEY" => Ok(document),
        "ENCRYPTED PRIVATE KEY" => decrypt(document.as_bytes(), passphrase),
        _ => Err(KeyError::UnsupportedLabel),
    }
}

/// Recognises an OpenSSL "traditional" key by its label or its headers.
fn is_legacy(text: &str) -> bool {
    if text.contains("DEK-Info:") {
        return true;
    }
    LEGACY_LABELS
        .iter()
        .any(|label| text.contains(&format!("-----BEGIN {label}-----")))
}

/// Decrypts a PBES2-wrapped PKCS#8 key.
fn decrypt(der: &[u8], passphrase: Option<&[u8]>) -> Result<SecretDocument, KeyError> {
    let passphrase = passphrase.ok_or(KeyError::PassphraseRequired)?;
    let encrypted = EncryptedPrivateKeyInfo::try_from(der).map_err(|_| KeyError::Malformed)?;
    encrypted
        .decrypt(passphrase)
        .map_err(|_| KeyError::PassphraseRejected)
}
