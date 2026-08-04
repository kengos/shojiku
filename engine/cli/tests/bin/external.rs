//! The `sign-prepare` / `sign-complete` pair as a caller actually invokes it.
//!
//! Spawning the real binary is what puts the dispatch in `main.rs` under test,
//! and it is the only place the two channels this pair promises — the payload
//! on stdout AND the same object inside the `--report` envelope — are checked
//! against each other rather than one at a time.

use std::path::PathBuf;

use super::sign::{example_pdf, key_dir};
use super::{path_arg, shojiku, temp_path};

const RSA: &str = "rsa-pkcs1-sha256";

/// The prepare payload as JSON, and the report it wrote beside it.
fn prepare(report: &std::path::Path) -> serde_json::Value {
    let out = shojiku(&[
        "sign-prepare",
        "--input",
        &example_pdf(),
        "--cert",
        &path_arg(key_dir().join("rsa2048.cert.pem")),
        "--algorithm",
        RSA,
        "--report",
        &path_arg(report.to_path_buf()),
    ]);
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    serde_json::from_slice(&out.stdout).expect("the payload is JSON on stdout")
}

/// Signs the prepared bytes with a key the binary never sees.
fn sign_elsewhere(payload: &serde_json::Value, name: &str) -> PathBuf {
    let to_be_signed = shojiku_signing::PrivateKey::from_pem(
        &std::fs::read(key_dir().join("rsa2048.key.pem")).expect("the generated key"),
        None,
    )
    .expect("the key loads")
    .sign(&decode(payload["toBeSigned"].as_str().expect("base64")))
    .expect("the external signer produces a signature");
    let path = temp_path(name);
    std::fs::write(&path, to_be_signed).expect("writing the signature");
    path
}

#[test]
fn preparing_prints_the_payload_and_carries_it_in_the_report() {
    let report = temp_path("prepare-report.json");
    let payload = prepare(&report);

    let envelope: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&report).expect("the report was written"))
            .expect("the report is JSON");
    assert_eq!(envelope["ok"], serde_json::json!(true));
    // The two channels have to agree: a script reads stdout, an SDK reads the
    // envelope, and they are the same object.
    assert_eq!(envelope["prepared"], payload);
}

#[test]
fn completing_writes_the_signed_document_to_stdout_and_reports_success() {
    let payload = prepare(&temp_path("prepare-1.json"));
    let signature = sign_elsewhere(&payload, "signature-1.bin");
    let report = temp_path("complete-report.json");

    let out = shojiku(&[
        "sign-complete",
        "--input",
        &example_pdf(),
        "--cert",
        &path_arg(key_dir().join("rsa2048.cert.pem")),
        "--algorithm",
        RSA,
        "--signature",
        &path_arg(signature),
        "--output",
        "-",
        "--report",
        &path_arg(report.clone()),
    ]);

    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    // `--output -` means the document rides stdout, so a shell pipeline needs
    // no temporary file at all.
    let original = std::fs::read(example_pdf()).expect("the example is committed");
    assert_eq!(&out.stdout[..original.len()], original.as_slice());
    let envelope: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&report).expect("the report was written"))
            .expect("the report is JSON");
    assert_eq!(envelope["ok"], serde_json::json!(true));
    // No page count: signing appends a revision to bytes it never laid out.
    assert!(envelope.get("pageCount").is_none());
}

#[test]
fn a_failure_still_writes_the_report_the_caller_asked_for() {
    // The path an SDK most needs and the easiest to leave out: a non-zero exit
    // with nothing to classify tells the caller nothing.
    let report = temp_path("prepare-failure.json");
    let out = shojiku(&[
        "sign-prepare",
        "--input",
        &example_pdf(),
        "--cert",
        &path_arg(key_dir().join("rsa2048.cert.pem")),
        "--algorithm",
        "rsa-pkcs1-sha1",
        "--report",
        &path_arg(report.clone()),
    ]);

    assert!(!out.status.success());
    let envelope: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&report).expect("the report was written"))
            .expect("the report is JSON");
    assert_eq!(envelope["ok"], serde_json::json!(false));
    assert_eq!(envelope["failure"]["class"], serde_json::json!("usage"));
    assert_eq!(envelope["failure"]["step"], serde_json::json!("sign"));
    assert_eq!(
        envelope["failure"]["kind"],
        serde_json::json!("invalid_request")
    );
}

#[test]
fn completing_reports_a_failure_before_writing_any_document() {
    let report = temp_path("complete-failure.json");
    let output_path = temp_path("never-written.pdf");
    let _ = std::fs::remove_file(&output_path);
    let empty = temp_path("empty.sig");
    std::fs::write(&empty, b"").expect("writing the fixture");

    let out = shojiku(&[
        "sign-complete",
        "--input",
        &example_pdf(),
        "--cert",
        &path_arg(key_dir().join("rsa2048.cert.pem")),
        "--algorithm",
        RSA,
        "--signature",
        &path_arg(empty),
        "--output",
        &path_arg(output_path.clone()),
        "--report",
        &path_arg(report.clone()),
    ]);

    assert!(!out.status.success());
    assert!(
        !output_path.exists(),
        "a document was written for a signature there was nothing in"
    );
    let envelope: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&report).expect("the report was written"))
            .expect("the report is JSON");
    assert_eq!(envelope["ok"], serde_json::json!(false));
    assert_eq!(envelope["failure"]["class"], serde_json::json!("usage"));
}

/// Standard base64, without a dependency this test binary does not have.
fn decode(text: &str) -> Vec<u8> {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut bits = 0_u32;
    let mut held = 0_u8;
    let mut out = Vec::new();
    for byte in text.bytes().filter(|byte| *byte != b'=') {
        let value = ALPHABET
            .iter()
            .position(|candidate| *candidate == byte)
            .expect("standard base64") as u32;
        bits = (bits << 6) | value;
        held += 6;
        if held >= 8 {
            held -= 8;
            out.push(u8::try_from((bits >> held) & 0xFF).expect("one byte"));
        }
    }
    out
}

#[test]
fn both_verbs_work_with_no_report_asked_for_at_all() {
    // The shell caller's invocation: `--report` is for SDKs, and a person
    // piping `sign-prepare` into `jq` never passes it. It is the branch a
    // suite that always asks for a report never reaches.
    let out = shojiku(&[
        "sign-prepare",
        "--input",
        &example_pdf(),
        "--cert",
        &path_arg(key_dir().join("rsa2048.cert.pem")),
        "--algorithm",
        RSA,
    ]);
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let payload: serde_json::Value =
        serde_json::from_slice(&out.stdout).expect("the payload is JSON on stdout");
    let signature = sign_elsewhere(&payload, "signature-bare.bin");

    let completed = shojiku(&[
        "sign-complete",
        "--input",
        &example_pdf(),
        "--cert",
        &path_arg(key_dir().join("rsa2048.cert.pem")),
        "--algorithm",
        RSA,
        "--signature",
        &path_arg(signature),
        "--output",
        "-",
    ]);
    assert!(
        completed.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&completed.stderr)
    );
    assert!(completed.stdout.starts_with(b"%PDF-"));
}
