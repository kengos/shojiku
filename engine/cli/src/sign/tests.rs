//! The `sign` command, including every way it asks for a passphrase.

use std::cell::Cell;
use std::path::PathBuf;

use super::{run_sign_with, PassphraseSource};
use crate::tests::{example_pdf, key_dir};
use crate::{CliError, ReportArg, SignArgs};
use zeroize::Zeroizing;

/// A passphrase source that answers from the test rather than the terminal,
/// and records whether it was asked at all.
struct Stub {
    variable: Option<&'static str>,
    prompt: Option<&'static str>,
    prompted: Cell<bool>,
}

impl Stub {
    fn answering(prompt: &'static str) -> Self {
        Self {
            variable: None,
            prompt: Some(prompt),
            prompted: Cell::new(false),
        }
    }

    fn with_variable(variable: &'static str) -> Self {
        Self {
            variable: Some(variable),
            prompt: None,
            prompted: Cell::new(false),
        }
    }

    fn silent() -> Self {
        Self {
            variable: None,
            prompt: None,
            prompted: Cell::new(false),
        }
    }
}

impl PassphraseSource for Stub {
    fn read_variable(&self, _name: &str) -> Option<Zeroizing<String>> {
        self.variable.map(|value| Zeroizing::new(value.to_owned()))
    }

    fn prompt(&self) -> Result<Zeroizing<String>, std::io::Error> {
        self.prompted.set(true);
        self.prompt
            .map(|value| Zeroizing::new(value.to_owned()))
            .ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::NotConnected, "no terminal in a test")
            })
    }
}

/// Arguments signing the example with one of the generated key pairs.
fn args(key: &str, stem: &str) -> SignArgs {
    SignArgs {
        input: example_pdf(),
        key: key_dir().join(key),
        cert: key_dir().join(format!("{stem}.cert.pem")),
        output: "-".to_owned(),
        passphrase_env: None,
        report: ReportArg::default(),
    }
}

#[test]
fn an_unencrypted_key_signs_without_asking_anything() {
    // The property that keeps a script from blocking on a question it has no
    // way to answer: nothing prompts unless the key actually needs it.
    let source = Stub::silent();
    let signed =
        run_sign_with(&args("ec256.key.pem", "ec256"), &source).expect("an unencrypted key signs");
    assert!(signed.starts_with(b"%PDF-"));
    assert!(
        !source.prompted.get(),
        "an unencrypted key was prompted for"
    );
}

#[test]
fn the_signed_document_is_longer_than_the_original_and_keeps_its_prefix() {
    let original = std::fs::read(example_pdf()).expect("the example is committed");
    let signed = run_sign_with(&args("rsa2048.key.pem", "rsa2048"), &Stub::silent())
        .expect("signing succeeds");
    assert_eq!(&signed[..original.len()], original.as_slice());
    assert!(signed.len() > original.len());
}

#[test]
fn an_encrypted_key_is_unlocked_from_the_prompt() {
    let passphrase = std::fs::read_to_string(key_dir().join("passphrase.txt"))
        .expect("the generator wrote the passphrase");
    // The stub answers what the generator used; the point is that the prompt
    // is what got asked.
    let source = Stub::answering(Box::leak(passphrase.into_boxed_str()));
    assert!(run_sign_with(&args("rsa2048.enc.pem", "rsa2048"), &source).is_ok());
    assert!(
        source.prompted.get(),
        "an encrypted key was not prompted for"
    );
}

#[test]
fn an_encrypted_key_is_unlocked_from_the_named_variable() {
    let passphrase = std::fs::read_to_string(key_dir().join("passphrase.txt"))
        .expect("the generator wrote the passphrase");
    let source = Stub::with_variable(Box::leak(passphrase.into_boxed_str()));
    let mut args = args("ec256.enc.pem", "ec256");
    args.passphrase_env = Some("SHOJIKU_TEST_PASSPHRASE".to_owned());
    assert!(run_sign_with(&args, &source).is_ok());
    assert!(
        !source.prompted.get(),
        "a named variable should not also prompt"
    );
}

#[test]
fn a_wrong_passphrase_is_reported_without_repeating_it() {
    let source = Stub::answering("not the passphrase");
    let error = run_sign_with(&args("rsa2048.enc.pem", "rsa2048"), &source)
        .expect_err("a wrong passphrase is refused");
    let message = error.to_string();
    assert!(message.contains("passphrase is wrong"), "{message}");
    assert!(
        !message.contains("not the passphrase"),
        "the error repeated the passphrase: {message}"
    );
}

#[test]
fn an_unset_variable_names_the_variable_rather_than_prompting() {
    // Falling back to a prompt here would hang an unattended run; naming the
    // variable is what lets the operator fix it.
    let source = Stub::silent();
    let mut args = args("rsa2048.enc.pem", "rsa2048");
    args.passphrase_env = Some("SHOJIKU_NOT_SET".to_owned());
    let error = run_sign_with(&args, &source).expect_err("an unset variable is an error");
    assert!(matches!(error, CliError::PassphraseVariableUnset { .. }));
    assert!(error.to_string().contains("SHOJIKU_NOT_SET"));
    assert!(
        !source.prompted.get(),
        "an unset variable fell back to a prompt"
    );
}

#[test]
fn a_prompt_that_cannot_be_read_is_reported() {
    let error = run_sign_with(&args("rsa2048.enc.pem", "rsa2048"), &Stub::silent())
        .expect_err("a failed prompt is an error");
    assert!(matches!(error, CliError::Passphrase(_)), "{error:?}");
}

#[test]
fn an_input_that_is_not_a_pdf_is_reported() {
    // A file that exists and is not a document this engine rendered: the
    // mistake of pointing `--input` at the template instead of the output.
    // The refusal has to come back through the command, not out of it.
    let not_a_pdf = key_dir().join("passphrase.txt");
    let mut args = args("ec256.key.pem", "ec256");
    args.input = not_a_pdf;
    let error =
        run_sign_with(&args, &Stub::silent()).expect_err("a file that is not a PDF is refused");
    assert!(error.to_string().contains("not a PDF"), "{error}");
}

#[test]
fn a_missing_input_names_the_path() {
    let mut args = args("ec256.key.pem", "ec256");
    args.input = PathBuf::from("/nonexistent/document.pdf");
    let error = run_sign_with(&args, &Stub::silent()).expect_err("a missing input is an error");
    assert!(error.to_string().contains("document.pdf"), "{error}");
}

#[test]
fn a_missing_key_names_the_path() {
    let mut args = args("ec256.key.pem", "ec256");
    args.key = PathBuf::from("/nonexistent/key.pem");
    let error = run_sign_with(&args, &Stub::silent()).expect_err("a missing key is an error");
    assert!(error.to_string().contains("key.pem"), "{error}");
}

#[test]
fn a_missing_certificate_names_the_path() {
    let mut args = args("ec256.key.pem", "ec256");
    args.cert = PathBuf::from("/nonexistent/cert.pem");
    let error =
        run_sign_with(&args, &Stub::silent()).expect_err("a missing certificate is an error");
    assert!(error.to_string().contains("cert.pem"), "{error}");
}

#[test]
fn a_legacy_key_reaches_the_caller_with_its_conversion_hint() {
    // The hint has to survive the trip from the signing crate to the command
    // line, since that is where somebody can act on it.
    let legacy = key_dir().join("legacy.pem");
    std::fs::write(
        &legacy,
        "-----BEGIN RSA PRIVATE KEY-----\n\
         Proc-Type: 4,ENCRYPTED\n\
         DEK-Info: DES-EDE3-CBC,0123456789ABCDEF\n\
         \n\
         bm90IGEgcmVhbCBrZXk=\n\
         -----END RSA PRIVATE KEY-----\n",
    )
    .expect("writing the fixture");
    let mut args = args("ec256.key.pem", "ec256");
    args.key = legacy;
    let error = run_sign_with(&args, &Stub::silent()).expect_err("a legacy key is refused");
    assert!(
        error.to_string().contains("openssl pkcs8 -topk8"),
        "{error}"
    );
}

#[test]
fn the_real_source_reads_the_process_environment() {
    // The adapter the command uses outside tests. Named per process so a
    // parallel test cannot see or clobber it.
    let name = format!("SHOJIKU_PASSPHRASE_PROBE_{}", std::process::id());
    std::env::set_var(&name, "a value from the environment");
    assert_eq!(
        super::Terminal
            .read_variable(&name)
            .as_deref()
            .map(String::as_str),
        Some("a value from the environment")
    );
    std::env::remove_var(&name);
    assert!(super::Terminal.read_variable(&name).is_none());
}

#[test]
fn the_real_prompt_reports_a_missing_terminal_rather_than_hanging() {
    // Guarded: this calls the genuine terminal read, which would block
    // forever if a terminal were attached. Every sanctioned path runs the
    // tests without one (the gates run Docker with no TTY), so the guard is
    // for a developer running cargo straight from a shell — there, the line
    // simply goes unmeasured rather than stopping the run dead.
    if std::io::IsTerminal::is_terminal(&std::io::stdin()) {
        return;
    }
    assert!(
        super::Terminal.prompt().is_err(),
        "there is no terminal to read a passphrase from"
    );
}
