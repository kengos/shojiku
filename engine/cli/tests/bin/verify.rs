//! The `verify` command as a caller actually invokes it.
//!
//! Spawning the real binary is what puts the dispatch in `main.rs` under
//! test, and it is the only place the two things callers depend on are what
//! this crate promises: the EXIT CODE (a script branches on it) and the fact
//! that the report is printed either way (a person reads it).

use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use super::{path_arg, shojiku, temp_path};

/// Generates key material for this test process, ONCE.
///
/// The `OnceLock` is load-bearing, not tidiness: these tests run in parallel
/// and share one output directory, and the generator writes its completion
/// sentinel last.
fn key_dir() -> &'static PathBuf {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| {
        let dir =
            std::env::temp_dir().join(format!("shojiku-bin-verify-keys-{}", std::process::id()));
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

fn example_pdf() -> String {
    path_arg(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../examples/business/receipt-ja/output.pdf"),
    )
}

/// Signs the bundled example with `stem`, through the real binary, and
/// returns the path it was written to.
fn signed_as(name: &str, stem: &str) -> String {
    let keys = key_dir();
    let path = path_arg(temp_path(name));
    let result = shojiku(&[
        "sign",
        "--input",
        &example_pdf(),
        "--key",
        &path_arg(keys.join(format!("{stem}.key.pem"))),
        "--cert",
        &path_arg(keys.join(format!("{stem}.cert.pem"))),
        "--output",
        &path,
    ]);
    assert!(
        result.status.success(),
        "signing the fixture failed: {}",
        String::from_utf8_lossy(&result.stderr)
    );
    path
}

/// The `--anchor` path for `stem`'s certificate.
fn anchor(stem: &str) -> String {
    path_arg(key_dir().join(format!("{stem}.cert.pem")))
}

#[test]
fn a_valid_document_prints_its_report_and_exits_zero() {
    let signed = signed_as("verify-ok.pdf", "rsa2048");
    let result = shojiku(&["verify", "--input", &signed, "--anchor", &anchor("rsa2048")]);
    assert!(
        result.status.success(),
        "verify failed: {}",
        String::from_utf8_lossy(&result.stderr)
    );
    let report: serde_json::Value =
        serde_json::from_slice(&result.stdout).expect("the report is JSON");
    assert_eq!(report["valid"], serde_json::json!(true));
    assert_eq!(report["signature"]["status"], "passed");
    assert_eq!(report["coverage"]["status"], "passed");
    // The omissions travel with a PASSING verdict, which is the whole
    // point of reporting them at all.
    assert_eq!(
        report["notChecked"],
        serde_json::json!(["revocation", "timestamp"])
    );
}

#[test]
fn an_invalid_document_still_prints_its_report_and_exits_non_zero() {
    // Both halves matter. The exit code is what a script branches on, and
    // the report is what tells a person WHICH check failed — a command that
    // only did one of the two would be useless for the other caller.
    let signed = signed_as("verify-bad-anchor.pdf", "rsa2048");
    let result = shojiku(&["verify", "--input", &signed, "--anchor", &anchor("ec256")]);
    assert!(
        !result.status.success(),
        "an untrusted document exited zero"
    );
    let report: serde_json::Value =
        serde_json::from_slice(&result.stdout).expect("the report is still JSON");
    assert_eq!(report["valid"], serde_json::json!(false));
    assert_eq!(report["signature"]["status"], "passed");
    assert_eq!(report["trustChain"]["status"], "failed");
    // No second, vaguer line on stderr: the report already said it.
    assert!(
        String::from_utf8_lossy(&result.stderr).trim().is_empty(),
        "stderr repeated the failure: {}",
        String::from_utf8_lossy(&result.stderr)
    );
}

#[test]
fn a_document_that_cannot_be_evaluated_says_so_on_stderr() {
    // The other kind of failure: not "this is untrustworthy" but "there is
    // nothing here to judge". That one has no report, so it does print.
    let result = shojiku(&[
        "verify",
        "--input",
        &example_pdf(),
        "--anchor",
        &anchor("rsa2048"),
    ]);
    assert!(!result.status.success());
    let stderr = String::from_utf8_lossy(&result.stderr);
    assert!(stderr.contains("carries no signature"), "{stderr}");
}

#[test]
fn there_is_no_way_to_verify_without_naming_a_trust_anchor() {
    // Verification never consults the machine's trust store, so there is no
    // default to fall back on and no flag that would invent one.
    let signed = signed_as("verify-no-anchor.pdf", "ec256");
    let result = shojiku(&["verify", "--input", &signed]);
    assert!(!result.status.success(), "verify ran with no anchor");
    let stderr = String::from_utf8_lossy(&result.stderr);
    assert!(stderr.contains("--anchor"), "{stderr}");
}
