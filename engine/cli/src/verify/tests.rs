//! The `verify` command over a real signed document.

use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use shojiku_signing::{sign_document, LocalPemSigner, PlaceholderOptions};
use shojiku_verify::{CheckOutcome, NotChecked, VerifyError};

use super::run_verify;
use crate::{CliError, ReportArg, VerifyArgs};

/// The generated key directory for this test process.
///
/// Memoized around the GENERATOR, not merely its path: the script writes its
/// completion sentinel last, so a second concurrent run would rewrite files
/// under a test already reading them.
fn key_dir() -> &'static PathBuf {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| {
        let dir =
            std::env::temp_dir().join(format!("shojiku-cli-verify-keys-{}", std::process::id()));
        let script =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../scripts/gen-test-keys.sh");
        let output = Command::new("sh")
            .arg(&script)
            .arg(&dir)
            .output()
            .unwrap_or_else(|error| panic!("could not run {}: {error}", script.display()));
        assert!(output.status.success(), "the key generator failed");
        dir
    })
}

/// A committed example's rendered output.
fn example_pdf() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/business/receipt-ja/output.pdf")
}

/// A scratch directory for this test binary's written fixtures.
fn scratch() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("shojiku-cli-verify-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("a scratch directory");
    dir
}

/// Signs the committed example with `stem`, writing it as `name`.
fn signed_file(name: &str, key_stem: &str, cert_stem: &str) -> PathBuf {
    let signer = LocalPemSigner::new(
        &std::fs::read(key_dir().join(format!("{key_stem}.key.pem"))).expect("a generated key"),
        None,
        &std::fs::read(key_dir().join(format!("{cert_stem}.cert.pem")))
            .expect("a generated certificate"),
    )
    .expect("the key pair loads");
    let pdf = std::fs::read(example_pdf()).expect("the example is committed");
    let signed = sign_document(&pdf, &signer, &PlaceholderOptions::default()).expect("it signs");
    let path = scratch().join(name);
    std::fs::write(&path, signed).expect("writing the signed fixture");
    path
}

/// Arguments verifying `input` against `stem`'s certificate.
fn args(input: PathBuf, stem: &str) -> VerifyArgs {
    VerifyArgs {
        input,
        anchor: vec![key_dir().join(format!("{stem}.cert.pem"))],
        report: ReportArg::default(),
    }
}

#[test]
fn a_signed_example_verifies_against_its_own_certificate() {
    let signed = signed_file("self-signed.pdf", "rsa2048", "rsa2048");
    let report = run_verify(&args(signed, "rsa2048")).expect("evaluates");
    assert!(report.is_valid(), "{report:?}");
}

#[test]
fn the_report_states_its_omissions_even_when_the_document_is_valid() {
    let signed = signed_file("omissions.pdf", "ec256", "ec256");
    let report = run_verify(&args(signed, "ec256")).expect("evaluates");
    assert_eq!(
        report.not_checked(),
        &[NotChecked::Revocation, NotChecked::Timestamp]
    );
}

#[test]
fn a_document_the_anchor_does_not_vouch_for_is_reported_not_valid() {
    // Not an error: it was evaluated, and the answer is no. The command
    // prints this report and exits non-zero.
    let signed = signed_file("wrong-anchor.pdf", "rsa2048", "rsa2048");
    let report = run_verify(&args(signed, "ec256")).expect("evaluates");
    assert!(!report.is_valid());
    assert_eq!(report.signature(), CheckOutcome::Passed);
    assert!(!report.trust_chain().is_passed());
}

#[test]
fn several_anchor_flags_are_read_as_one_set() {
    // One flag holding a chain and several flags holding one certificate
    // each must behave identically, so the files are concatenated.
    let signed = signed_file("several-anchors.pdf", "rsa2048", "rsa2048");
    let mut args = args(signed, "ec256");
    args.anchor.push(key_dir().join("rsa2048.cert.pem"));
    assert!(run_verify(&args).expect("evaluates").is_valid());
}

#[test]
fn a_certificate_issued_by_a_trusted_authority_verifies() {
    let signed = signed_file("leaf.pdf", "leaf", "leaf");
    assert!(run_verify(&args(signed, "ca"))
        .expect("evaluates")
        .is_valid());
}

#[test]
fn an_unsigned_document_cannot_be_evaluated() {
    let outcome = run_verify(&args(example_pdf(), "rsa2048"));
    assert!(matches!(
        outcome,
        Err(CliError::Verify(VerifyError::NoSignature))
    ));
}

#[test]
fn a_missing_input_names_the_path_that_was_not_there() {
    let missing = scratch().join("no-such-document.pdf");
    let outcome = run_verify(&args(missing.clone(), "rsa2048"));
    match outcome {
        Err(CliError::Io { path, .. }) => assert_eq!(path, missing),
        other => panic!("expected an I/O error, got {other:?}"),
    }
}

#[test]
fn a_missing_anchor_file_names_the_path_that_was_not_there() {
    let signed = signed_file("missing-anchor.pdf", "rsa2048", "rsa2048");
    let missing = scratch().join("no-such-anchor.pem");
    let args = VerifyArgs {
        input: signed,
        anchor: vec![missing.clone()],
        report: ReportArg::default(),
    };
    match run_verify(&args) {
        Err(CliError::Io { path, .. }) => assert_eq!(path, missing),
        other => panic!("expected an I/O error, got {other:?}"),
    }
}

#[test]
fn an_anchor_file_that_is_not_a_certificate_is_refused() {
    let signed = signed_file("bad-anchor.pdf", "rsa2048", "rsa2048");
    let args = VerifyArgs {
        input: signed,
        // A private key is PEM, and is not something to trust.
        anchor: vec![key_dir().join("rsa2048.key.pem")],
        report: ReportArg::default(),
    };
    assert!(matches!(
        run_verify(&args),
        Err(CliError::Verify(VerifyError::AnchorNotPem))
    ));
}
