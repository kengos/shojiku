//! The `sign` command as a caller actually invokes it.
//!
//! Spawning the real binary is what puts the dispatch in `main.rs` under
//! test, and it is also the only place the exit code and the stderr wording
//! — the two things a script and a person respectively depend on — are what
//! this crate promises.

use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use super::{path_arg, shojiku, temp_path};

/// Generates key material for this test process, ONCE.
///
/// The `OnceLock` is load-bearing, not tidiness: these tests run in parallel
/// and share one output directory, and the generator writes its completion
/// sentinel last. Without it, a second caller starting before that sentinel
/// exists rewrites the keys under a test already reading them — which showed
/// up only under the slower coverage run, as a signing failure with no
/// obvious cause.
pub(super) fn key_dir() -> &'static PathBuf {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| {
        let dir =
            std::env::temp_dir().join(format!("shojiku-bin-sign-keys-{}", std::process::id()));
        let script =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../scripts/gen-test-keys.sh");
        let output = Command::new("sh")
            .arg(&script)
            .arg(&dir)
            .output()
            .expect("run the key generator");
        assert!(output.status.success(), "the key generator failed");
        dir
    })
}

pub(super) fn example_pdf() -> String {
    path_arg(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../examples/business/receipt-ja/output.pdf"),
    )
}

#[test]
fn signing_writes_a_pdf_and_exits_zero() {
    let keys = key_dir();
    let output_path = temp_path("signed.pdf");
    let result = shojiku(&[
        "sign",
        "--input",
        &example_pdf(),
        "--key",
        &path_arg(keys.join("ec256.key.pem")),
        "--cert",
        &path_arg(keys.join("ec256.cert.pem")),
        "--output",
        &path_arg(output_path.clone()),
    ]);
    assert!(
        result.status.success(),
        "sign failed: {}",
        String::from_utf8_lossy(&result.stderr)
    );
    let signed = std::fs::read(&output_path).expect("the signed document was written");
    assert!(signed.starts_with(b"%PDF-"));
    assert!(
        signed.windows(10).any(|window| window == b"/Type /Sig"),
        "the written document carries no signature dictionary"
    );
    let _ = std::fs::remove_file(&output_path);
}

#[test]
fn signing_to_stdout_streams_the_document() {
    let keys = key_dir();
    let result = shojiku(&[
        "sign",
        "--input",
        &example_pdf(),
        "--key",
        &path_arg(keys.join("rsa2048.key.pem")),
        "--cert",
        &path_arg(keys.join("rsa2048.cert.pem")),
        "--output",
        "-",
    ]);
    assert!(
        result.status.success(),
        "sign failed: {}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert!(result.stdout.starts_with(b"%PDF-"));
}

#[test]
fn a_missing_input_fails_with_a_message_naming_it() {
    let keys = key_dir();
    let result = shojiku(&[
        "sign",
        "--input",
        "/nonexistent/input.pdf",
        "--key",
        &path_arg(keys.join("ec256.key.pem")),
        "--cert",
        &path_arg(keys.join("ec256.cert.pem")),
        "--output",
        "-",
    ]);
    assert!(!result.status.success());
    let stderr = String::from_utf8_lossy(&result.stderr);
    assert!(stderr.contains("input.pdf"), "{stderr}");
}

#[test]
fn a_key_that_cannot_be_unlocked_fails_with_a_nonzero_exit() {
    // The shape an unattended run actually hits: an encrypted key and a
    // variable that is not set. What a script depends on is the exit code;
    // what a person depends on is the message naming the variable.
    let keys = key_dir();
    let result = shojiku(&[
        "sign",
        "--input",
        &example_pdf(),
        "--key",
        &path_arg(keys.join("rsa2048.enc.pem")),
        "--cert",
        &path_arg(keys.join("rsa2048.cert.pem")),
        "--output",
        "-",
        "--passphrase-env",
        "SHOJIKU_DEFINITELY_NOT_SET",
    ]);
    assert!(
        !result.status.success(),
        "an unlockable key should not exit 0"
    );
    assert!(result.stdout.is_empty(), "nothing should reach stdout");
    let stderr = String::from_utf8_lossy(&result.stderr);
    assert!(stderr.contains("SHOJIKU_DEFINITELY_NOT_SET"), "{stderr}");
}

#[test]
fn there_is_no_flag_that_takes_a_passphrase_directly() {
    // A deliberate absence, pinned: anything in argv is readable by other
    // processes and lands in shell history, so this flag must never appear.
    // If somebody adds one, this test is what says no.
    let help = shojiku(&["sign", "--help"]);
    let text = String::from_utf8_lossy(&help.stdout);
    assert!(text.contains("--passphrase-env"), "{text}");
    assert!(
        !text.contains("--passphrase "),
        "a passphrase flag appeared in the help: {text}"
    );
}
