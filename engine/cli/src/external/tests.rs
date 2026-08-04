//! The two-step verbs: what they hand out, what they write, what they refuse.
//!
//! The signature these tests hand back is produced by the crate the engine
//! itself signs with, standing in for a key service. That is the honest shape:
//! nothing about this command knows where a signature came from, so a test
//! that could tell would be testing something the command cannot see.

use std::path::PathBuf;

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use shojiku_signing::PrivateKey;

use super::{run_sign_complete, run_sign_prepare, Prepared};
use crate::args::{SignCompleteArgs, SignPrepareArgs};
use crate::sign::PassphraseSource;
use crate::tests::{example_pdf, key_dir};
use crate::ReportArg;

/// A passphrase source that answers nothing.
///
/// The local-key comparison below signs with an UNENCRYPTED key, so nothing
/// ever asks — and a source that would answer would hide it if something did.
pub(super) struct Silent;

impl PassphraseSource for Silent {
    fn read_variable(&self, _name: &str) -> Option<zeroize::Zeroizing<String>> {
        None
    }

    fn prompt(&self) -> Result<zeroize::Zeroizing<String>, std::io::Error> {
        Err(std::io::Error::new(
            std::io::ErrorKind::NotConnected,
            "no terminal in a test",
        ))
    }
}

pub(super) const RSA: &str = "rsa-pkcs1-sha256";
pub(super) const EC: &str = "ecdsa-p256-sha256";

pub(super) fn prepare_args(stem: &str, algorithm: &str) -> SignPrepareArgs {
    SignPrepareArgs {
        input: example_pdf(),
        cert: key_dir().join(format!("{stem}.cert.pem")),
        algorithm: algorithm.to_owned(),
        report: ReportArg::default(),
    }
}

pub(super) fn complete_args(stem: &str, algorithm: &str, signature: PathBuf) -> SignCompleteArgs {
    SignCompleteArgs {
        input: example_pdf(),
        cert: key_dir().join(format!("{stem}.cert.pem")),
        algorithm: algorithm.to_owned(),
        signature,
        output: "-".to_owned(),
        report: ReportArg::default(),
    }
}

/// Signs the prepared bytes with a key the command never sees, and writes the
/// raw signature where `--signature` will read it.
pub(super) fn sign_elsewhere(prepared: &Prepared, stem: &str, name: &str) -> PathBuf {
    let to_be_signed = STANDARD
        .decode(&prepared.to_be_signed)
        .expect("the payload is base64");
    let signature = PrivateKey::from_pem(
        &std::fs::read(key_dir().join(format!("{stem}.key.pem"))).expect("the generated key"),
        None,
    )
    .expect("the key loads")
    .sign(&to_be_signed)
    .expect("the external signer produces a signature");
    let path = std::env::temp_dir().join(format!(
        "shojiku-cli-external-{}-{name}.sig",
        std::process::id()
    ));
    std::fs::write(&path, signature).expect("writing the signature");
    path
}

/// The whole round trip, for one key pair.
pub(super) fn round_trip(stem: &str, algorithm: &str) -> Vec<u8> {
    let prepared = run_sign_prepare(&prepare_args(stem, algorithm)).expect("preparing succeeds");
    let signature = sign_elsewhere(&prepared, stem, stem);
    run_sign_complete(&complete_args(stem, algorithm, signature)).expect("completing succeeds")
}

mod accept;
mod refuse;
