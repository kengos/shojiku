//! Test key material, generated fresh for every test process.
//!
//! Same posture as the signing crate's: nothing is committed, so there is
//! nothing in the repository worth stealing and nothing that can quietly
//! expire. The generator runs ONCE per test binary through a `OnceLock` —
//! not merely once per path lookup. It writes its completion sentinel last,
//! so a second concurrent run would rewrite files under a test already
//! reading them, and being idempotent does not make a generator safe to run
//! concurrently with itself.

use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use shojiku_signing::LocalPemSigner;

use crate::TrustAnchors;

/// The directory holding this process's generated key material.
fn key_dir() -> &'static PathBuf {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(generate)
}

/// Runs the generator into a per-process directory.
fn generate() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("shojiku-verify-keys-{}", std::process::id()));
    let script = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../scripts/gen-test-keys.sh");
    let output = Command::new("sh")
        .arg(&script)
        .arg(&dir)
        .output()
        .expect("running the test-key generator");
    // One line, plain message: an assert whose format arguments span several
    // lines only evaluates them on failure, and the coverage gate reads those
    // lines as unreached.
    assert!(output.status.success(), "the test-key generator failed");
    dir
}

/// Reads one generated file, e.g. `rsa2048.cert.pem`.
pub(crate) fn read(name: &str) -> Vec<u8> {
    std::fs::read(key_dir().join(name)).expect("a generated test key")
}

/// A signer over the key pair named by `stem` (`rsa2048`, `ec256`, …).
pub(crate) fn signer(stem: &str) -> LocalPemSigner {
    signer_with(stem, stem)
}

/// A signer holding `key_stem`'s key and `cert_stem`'s certificate, so a
/// chain case can sign with a leaf whose issuer is elsewhere.
pub(crate) fn signer_with(key_stem: &str, cert_stem: &str) -> LocalPemSigner {
    LocalPemSigner::new(
        &read(&format!("{key_stem}.key.pem")),
        None,
        &read(&format!("{cert_stem}.cert.pem")),
    )
    .expect("the generated key pair loads")
}

/// Trust anchors holding the certificate named by `stem`.
pub(crate) fn anchors(stem: &str) -> TrustAnchors {
    TrustAnchors::from_pem(&read(&format!("{stem}.cert.pem"))).expect("the certificate loads")
}
