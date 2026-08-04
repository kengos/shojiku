//! `shojiku_sign`: a rendered PDF in, a signed one out.
//!
//! Key material crosses as borrowed bytes and is never copied here — the
//! signing crate reads the caller's slices directly, so this library holds no
//! buffer worth zeroizing and cannot leak one it does not have. Its errors
//! are built from `&'static str` and numbers by design, so a rejection names
//! what was unsupported without echoing the key.
//!
//! The passphrase is asked for the same way the CLI asks: only after the key
//! turns out to need one. An unencrypted key never has to carry a null
//! passphrase argument for form's sake, and an encrypted one with no
//! passphrase supplied gets a named failure rather than a parse error.
//!
//! [`external`] is the other half of the surface: the same signature, in two
//! calls, for a key this process is never given.

pub(crate) mod external;

use crate::result::ShojikuResult;
use crate::status::{encode, Failure};
use shojiku_diagnostics::Diagnostics;
use shojiku_signing::{sign_document, KeyError, LocalPemSigner, PlaceholderOptions};

/// Signs `pdf`. The signed bytes begin with `pdf` byte for byte — signing
/// appends a revision, it never rewrites what was there.
pub(crate) fn run(
    pdf: &[u8],
    key: &[u8],
    certificate: &[u8],
    passphrase: Option<&[u8]>,
) -> Result<ShojikuResult, Failure> {
    let signer = load_signer(key, certificate, passphrase)?;
    // The default window holds every signature this release can produce, and
    // the CLI exposes no knob for it either: a caller cannot get the size
    // wrong if there is nothing to set.
    let signed = sign_document(pdf, &signer, &PlaceholderOptions::default())
        .map_err(|err| Failure::host("sign", "signing", &err))?;
    // Signing emits no diagnostics of its own; the empty list keeps every
    // operation's result the same shape for an SDK to read.
    Ok(ShojikuResult::pdf(signed, encode(&Diagnostics::new())))
}

/// Builds the signer, using the passphrase only if the key turns out to be
/// encrypted.
fn load_signer(
    key: &[u8],
    certificate: &[u8],
    passphrase: Option<&[u8]>,
) -> Result<LocalPemSigner, Failure> {
    match LocalPemSigner::new(key, None, certificate) {
        Err(KeyError::PassphraseRequired) => {
            let Some(passphrase) = passphrase else {
                return Err(Failure::Host {
                    step: "sign",
                    kind: "passphrase_required",
                    message: "the key is encrypted; supply its passphrase".to_string(),
                });
            };
            LocalPemSigner::new(key, Some(passphrase), certificate)
                .map_err(|err| Failure::host("sign", "key", &err))
        }
        other => other.map_err(|err| Failure::host("sign", "key", &err)),
    }
}
