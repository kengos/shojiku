//! Setup shared by the fuzz targets: the key material a verifier needs.
//!
//! `verify_document` takes trust anchors, and an empty set short-circuits
//! before any parser runs — so a target that could not build one would fuzz
//! nothing. The material is GENERATED, never committed, by the same script
//! the test suites use: a certificate in the repository would be key
//! material by the signing track's rules, and would quietly expire besides.
//!
//! Generation runs once per process behind a `OnceLock`, which matters more
//! here than in a test binary: libFuzzer calls the entry point millions of
//! times, and re-running a key generator inside that loop would measure
//! OpenSSL rather than the parsers.

use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use shojiku_verify::TrustAnchors;

/// The directory holding this process's generated key material.
fn key_dir() -> &'static PathBuf {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(generate)
}

/// Runs the generator into a per-process directory.
fn generate() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("shojiku-fuzz-keys-{}", std::process::id()));
    let script = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../scripts/gen-test-keys.sh");
    let output = Command::new("sh")
        .arg(&script)
        .arg(&dir)
        .output()
        .expect("running the test-key generator");
    assert!(output.status.success(), "the test-key generator failed");
    dir
}

/// Reads one generated file, e.g. `rsa2048.cert.pem`.
#[must_use]
pub fn read(name: &str) -> Vec<u8> {
    std::fs::read(key_dir().join(name)).expect("a generated test key")
}

/// The anchor set every `verify_document` run is judged against.
#[must_use]
pub fn anchors() -> &'static TrustAnchors {
    static ANCHORS: OnceLock<TrustAnchors> = OnceLock::new();
    ANCHORS.get_or_init(|| {
        TrustAnchors::from_pem(&read("rsa2048.cert.pem")).expect("the certificate loads")
    })
}
