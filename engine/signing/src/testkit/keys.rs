//! Test key material, generated fresh for every test process.
//!
//! No key or certificate is committed, so there is nothing in the repository
//! worth stealing and nothing that can quietly expire. The cost is one
//! `openssl` run per test binary, which the generator makes idempotent and
//! this module runs once.
//!
//! The directory is keyed by process id: two test binaries running in
//! parallel each get their own, so neither can see the other half-written.

use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

/// The generated key material for this process.
pub(crate) struct TestKeys {
    dir: PathBuf,
}

impl TestKeys {
    /// Reads one generated file, e.g. `rsa2048.key.pem`.
    pub(crate) fn read(&self, name: &str) -> Vec<u8> {
        std::fs::read(self.dir.join(name)).expect("a generated test key")
    }

    /// The passphrase the encrypted keys were written with.
    pub(crate) fn passphrase(&self) -> Vec<u8> {
        self.read("passphrase.txt")
    }
}

/// The generated key material, produced on first use.
pub(crate) fn keys() -> &'static TestKeys {
    static KEYS: OnceLock<TestKeys> = OnceLock::new();
    KEYS.get_or_init(generate)
}

/// Runs the generator into a per-process directory.
fn generate() -> TestKeys {
    let dir = std::env::temp_dir().join(format!("shojiku-signing-keys-{}", std::process::id()));
    let script = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../scripts/gen-test-keys.sh");
    let output = Command::new("sh")
        .arg(&script)
        .arg(&dir)
        .output()
        .expect("running the test-key generator");
    // One line, plain message: an assert whose format arguments span several
    // lines only evaluates them on failure, and the coverage gate reads those
    // lines as unreached. The generator prints its own diagnosis to stderr.
    assert!(output.status.success(), "the test-key generator failed");
    TestKeys { dir }
}
