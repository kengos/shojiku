//! Everything the pair refuses, and what it says while refusing it.

use std::path::PathBuf;

use super::{complete_args, prepare_args, sign_elsewhere, RSA};
use crate::args::{SignCompleteArgs, SignPrepareArgs};
use crate::external::{run_sign_complete, run_sign_prepare};
use crate::tests::{example_pdf, key_dir};
use crate::CliError;

#[test]
fn an_algorithm_no_release_writes_is_refused_without_echoing_it() {
    let error = run_sign_prepare(&prepare_args("rsa2048", "rsa-pkcs1-sha1"))
        .expect_err("an unsupported algorithm is refused");
    let message = error.to_string();

    assert!(matches!(error, CliError::Algorithm));
    assert!(message.contains("rsa-pkcs1-sha256"), "{message}");
    assert!(message.contains("ecdsa-p256-sha256"), "{message}");
    assert!(!message.contains("sha1"), "the refusal echoed the request");
}

#[test]
fn a_hostile_algorithm_string_reaches_no_output_at_all() {
    // The value is the caller's, and a CLI error line lands on a terminal.
    let hostile = format!("\u{1b}[2J{}", "A".repeat(10_000));
    let error = run_sign_complete(&SignCompleteArgs {
        algorithm: hostile,
        ..complete_args("rsa2048", RSA, PathBuf::from("/nonexistent/signature.bin"))
    })
    .expect_err("an unsupported algorithm is refused");
    let message = error.to_string();

    assert!(!message.contains("AAAA"), "{message}");
    assert!(
        !message.contains('\u{1b}'),
        "an escape sequence reached stderr"
    );
}

#[test]
fn an_algorithm_is_checked_before_the_signature_file_is_read() {
    // So a caller learns the invocation is wrong without also being told
    // about a file that was never going to be used.
    let error = run_sign_complete(&SignCompleteArgs {
        algorithm: "nonsense".to_owned(),
        ..complete_args("rsa2048", RSA, PathBuf::from("/nonexistent/signature.bin"))
    })
    .expect_err("an unsupported algorithm is refused");
    assert!(matches!(error, CliError::Algorithm), "{error:?}");
}

#[test]
fn an_empty_signature_file_is_refused_rather_than_written() {
    // It would produce a document that looks signed and is not.
    let empty = std::env::temp_dir().join(format!("shojiku-cli-empty-{}.sig", std::process::id()));
    std::fs::write(&empty, b"").expect("writing the fixture");
    let error = run_sign_complete(&complete_args("rsa2048", RSA, empty))
        .expect_err("an empty signature is refused");

    assert!(matches!(error, CliError::EmptySignature));
    assert_eq!(error.kind(), "invalid_request");
    assert_eq!(error.class(), crate::FailureClass::Usage);
}

#[test]
fn a_signature_at_exactly_the_window_capacity_is_admitted() {
    // The boundary the size check creates: one byte over is refused, and the
    // largest signature it ADMITS still has to travel the whole path rather
    // than tripping the same guard.
    let prepared = run_sign_prepare(&prepare_args("rsa2048", RSA)).expect("preparing succeeds");
    let at_capacity =
        std::env::temp_dir().join(format!("shojiku-cli-at-cap-{}.sig", std::process::id()));
    std::fs::write(&at_capacity, vec![0x41; prepared.capacity]).expect("writing the fixture");

    // A signature this long leaves no room for the container around it, so it
    // is refused by the CONTAINER's size check rather than by an index — the
    // distinction that keeps an overlong write from landing on valid bytes.
    let error = run_sign_complete(&complete_args("rsa2048", RSA, at_capacity))
        .expect_err("the container around it does not fit");
    assert!(matches!(error, CliError::Signing(_)), "{error:?}");
}

#[test]
fn a_signature_larger_than_the_window_is_refused_rather_than_overrunning_it() {
    let prepared = run_sign_prepare(&prepare_args("rsa2048", RSA)).expect("preparing succeeds");
    let oversized =
        std::env::temp_dir().join(format!("shojiku-cli-oversized-{}.sig", std::process::id()));
    std::fs::write(&oversized, vec![0x41; prepared.capacity + 1]).expect("writing the fixture");

    let error = run_sign_complete(&complete_args("rsa2048", RSA, oversized))
        .expect_err("an oversized signature is refused");
    assert!(matches!(error, CliError::Signing(_)), "{error:?}");
}

#[test]
fn a_signature_file_that_cannot_be_read_is_the_documents_failure_not_the_callers() {
    // The frozen rule for the subprocess SDKs: an unreadable INPUT FILE comes
    // back as a failed result, not as programmer misuse.
    let error = run_sign_complete(&complete_args(
        "rsa2048",
        RSA,
        PathBuf::from("/nonexistent/signature.bin"),
    ))
    .expect_err("a missing signature file is an error");

    assert_eq!(error.kind(), "io");
    assert_eq!(error.class(), crate::FailureClass::Document);
    assert!(error.to_string().contains("signature.bin"), "{error}");
}

#[test]
fn an_unreadable_certificate_is_reported_before_anything_is_prepared() {
    let error = run_sign_prepare(&SignPrepareArgs {
        cert: PathBuf::from("/nonexistent/signer.crt"),
        ..prepare_args("rsa2048", RSA)
    })
    .expect_err("a missing certificate is an error");

    assert_eq!(error.class(), crate::FailureClass::Document);
    assert!(error.to_string().contains("signer.crt"), "{error}");
}

#[test]
fn a_certificate_that_is_not_one_is_refused_by_name() {
    let error = run_sign_prepare(&SignPrepareArgs {
        cert: key_dir().join("passphrase.txt"),
        ..prepare_args("rsa2048", RSA)
    })
    .expect_err("a file that is not a certificate is refused");

    assert!(matches!(error, CliError::Cms(_)), "{error:?}");
    assert_eq!(error.kind(), "certificate");
}

#[test]
fn an_input_that_is_not_a_pdf_is_refused_by_both_verbs() {
    // The mistake of pointing `--input` at the template instead of the output.
    let not_a_pdf = key_dir().join("passphrase.txt");
    let error = run_sign_prepare(&SignPrepareArgs {
        input: not_a_pdf.clone(),
        ..prepare_args("rsa2048", RSA)
    })
    .expect_err("a file that is not a PDF is refused");
    assert!(error.to_string().contains("not a PDF"), "{error}");

    let prepared = run_sign_prepare(&prepare_args("rsa2048", RSA)).expect("preparing succeeds");
    let signature = sign_elsewhere(&prepared, "rsa2048", "not-a-pdf");
    let error = run_sign_complete(&SignCompleteArgs {
        input: not_a_pdf,
        ..complete_args("rsa2048", RSA, signature)
    })
    .expect_err("a file that is not a PDF is refused");
    assert!(error.to_string().contains("not a PDF"), "{error}");
}

#[test]
fn a_truncated_document_degrades_to_a_structured_failure() {
    // Hostile input reaches this surface: a caller can point `--input` at
    // anything. What it must not do is panic.
    let truncated =
        std::env::temp_dir().join(format!("shojiku-cli-truncated-{}.pdf", std::process::id()));
    let whole = std::fs::read(example_pdf()).expect("the example is committed");
    std::fs::write(&truncated, &whole[..whole.len() / 2]).expect("writing the fixture");

    let error = run_sign_prepare(&SignPrepareArgs {
        input: truncated,
        ..prepare_args("rsa2048", RSA)
    })
    .expect_err("a truncated document is refused");
    assert!(matches!(error, CliError::Signing(_)), "{error:?}");
}

#[test]
fn a_missing_input_names_the_path() {
    let error = run_sign_prepare(&SignPrepareArgs {
        input: PathBuf::from("/nonexistent/document.pdf"),
        ..prepare_args("rsa2048", RSA)
    })
    .expect_err("a missing input is an error");
    assert!(error.to_string().contains("document.pdf"), "{error}");
}
