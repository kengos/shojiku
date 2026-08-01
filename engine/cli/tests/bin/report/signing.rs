//! `--report` over the SIGN and VERIFY lifecycle steps, including the
//! two surfaces a secret must never reach: the failure message and the
//! report file a caller keeps.

use super::*;
use std::process::Command;
use std::sync::OnceLock;

fn key_dir() -> &'static PathBuf {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| {
        let dir =
            std::env::temp_dir().join(format!("shojiku-bin-report-keys-{}", std::process::id()));
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
    path_arg(examples_dir().join("output.pdf"))
}

#[test]
fn signing_reports_ok_and_no_page_count() {
    let keys = key_dir();
    let signed = temp_path("report-signed.pdf");
    let report = temp_path("sign-ok.json");
    let out = shojiku(&[
        "sign",
        "--input",
        &example_pdf(),
        "--key",
        &path_arg(keys.join("ec256.key.pem")),
        "--cert",
        &path_arg(keys.join("ec256.cert.pem")),
        "--output",
        &path_arg(signed.clone()),
        "--report",
        &path_arg(report.clone()),
    ]);
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    std::fs::remove_file(&signed).expect("cleanup");
    let value = read_report(&report);
    assert_eq!(value["ok"], serde_json::json!(true));
    // Absent, not zero: signing appends a revision to bytes it never laid
    // out, and zero would read as "a document with no pages".
    assert!(value.get("pageCount").is_none(), "{value}");
}

#[test]
fn an_unusable_key_reports_a_document_failure_without_echoing_key_material() {
    let keys = key_dir();
    let report = temp_path("sign-badkey.json");
    let key_path = keys.join("rsa1024.key.pem");
    let out = shojiku(&[
        "sign",
        "--input",
        &example_pdf(),
        "--key",
        &path_arg(key_path.clone()),
        "--cert",
        &path_arg(keys.join("rsa2048.cert.pem")),
        "--output",
        "-",
        "--report",
        &path_arg(report.clone()),
    ]);
    assert!(!out.status.success(), "a key below the floor cannot sign");
    let value = read_report(&report);
    assert_eq!(value["ok"], serde_json::json!(false));
    // An unusable key is a fact about the request, not programmer misuse:
    // an SDK returns a failed result for it and must not raise.
    assert_eq!(value["failure"]["class"], serde_json::json!("document"));
    assert_eq!(value["failure"]["step"], serde_json::json!("sign"));

    // The security bar: this file is read by SDKs that put the message
    // into logs and exception reporters.
    let text = serde_json::to_string(&value).expect("re-serialize");
    let pem = std::fs::read_to_string(&key_path).expect("read the key");
    let body: String = pem
        .lines()
        .filter(|l| !l.starts_with("-----"))
        .collect::<String>();
    let secret = &body[..40.min(body.len())];
    assert!(
        !text.contains(secret),
        "the report must never echo key material"
    );
    assert!(
        !text.contains("BEGIN PRIVATE KEY"),
        "the report must never echo a PEM block"
    );
}

#[test]
fn a_passphrase_never_reaches_the_report() {
    let keys = key_dir();
    let passphrase = std::fs::read_to_string(keys.join("passphrase.txt")).expect("passphrase");
    let passphrase = passphrase.trim().to_string();
    let report = temp_path("sign-passphrase.json");
    let signed = temp_path("report-signed-enc.pdf");
    let out = Command::new(env!("CARGO_BIN_EXE_shojiku"))
        .args([
            "sign",
            "--input",
            &example_pdf(),
            "--key",
            &path_arg(keys.join("ec256.enc.pem")),
            "--cert",
            &path_arg(keys.join("ec256.cert.pem")),
            "--output",
            &path_arg(signed.clone()),
            "--report",
            &path_arg(report.clone()),
            "--passphrase-env",
            "SHOJIKU_TEST_PASSPHRASE",
        ])
        .env("SHOJIKU_TEST_PASSPHRASE", &passphrase)
        .output()
        .expect("spawn shojiku");
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let _ = std::fs::remove_file(&signed);
    let text = std::fs::read_to_string(&report).expect("report");
    std::fs::remove_file(&report).expect("cleanup");
    assert!(
        !text.contains(&passphrase),
        "a log line is the easiest way for a secret to leave a process"
    );
}

#[test]
fn a_signed_document_that_cannot_be_written_reports_a_usage_failure() {
    let keys = key_dir();
    let dir = temp_path("signed-output-is-a-directory");
    std::fs::create_dir_all(&dir).expect("scratch dir");
    let report = temp_path("sign-badoutput.json");
    let out = shojiku(&[
        "sign",
        "--input",
        &example_pdf(),
        "--key",
        &path_arg(keys.join("ec256.key.pem")),
        "--cert",
        &path_arg(keys.join("ec256.cert.pem")),
        "--output",
        &path_arg(dir.clone()),
        "--report",
        &path_arg(report.clone()),
    ]);
    std::fs::remove_dir_all(&dir).expect("cleanup");
    assert!(!out.status.success());
    let value = read_report(&report);
    assert_eq!(value["failure"]["class"], serde_json::json!("usage"));
    assert_eq!(value["failure"]["kind"], serde_json::json!("output"));
    assert_eq!(value["failure"]["step"], serde_json::json!("sign"));
}

#[test]
fn verifying_carries_the_report_on_a_passing_verdict() {
    let keys = key_dir();
    let signed = temp_path("verify-ok.pdf");
    let sign = shojiku(&[
        "sign",
        "--input",
        &example_pdf(),
        "--key",
        &path_arg(keys.join("rsa2048.key.pem")),
        "--cert",
        &path_arg(keys.join("rsa2048.cert.pem")),
        "--output",
        &path_arg(signed.clone()),
    ]);
    assert!(sign.status.success());

    let report = temp_path("verify-ok.json");
    let out = shojiku(&[
        "verify",
        "--input",
        &path_arg(signed.clone()),
        "--anchor",
        &path_arg(keys.join("rsa2048.cert.pem")),
        "--report",
        &path_arg(report.clone()),
    ]);
    std::fs::remove_file(&signed).expect("cleanup");
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let value = read_report(&report);
    assert_eq!(value["ok"], serde_json::json!(true));
    // No false assurance: what this release did NOT check has to survive
    // the binding, on a passing verdict as much as a failing one.
    assert!(
        value["verification"]["notChecked"].is_array(),
        "the verification report must name what it skipped: {value}"
    );
}

#[test]
fn a_failing_verdict_still_carries_the_verification_report() {
    let keys = key_dir();
    let signed = temp_path("verify-bad.pdf");
    let sign = shojiku(&[
        "sign",
        "--input",
        &example_pdf(),
        "--key",
        &path_arg(keys.join("rsa2048.key.pem")),
        "--cert",
        &path_arg(keys.join("rsa2048.cert.pem")),
        "--output",
        &path_arg(signed.clone()),
    ]);
    assert!(sign.status.success());

    // Verify against an authority that signed nothing here.
    let report = temp_path("verify-bad.json");
    let out = shojiku(&[
        "verify",
        "--input",
        &path_arg(signed.clone()),
        "--anchor",
        &path_arg(keys.join("other-ca.cert.pem")),
        "--report",
        &path_arg(report.clone()),
    ]);
    std::fs::remove_file(&signed).expect("cleanup");
    assert!(!out.status.success(), "an untrusted signer must not verify");
    let value = read_report(&report);
    assert_eq!(value["ok"], serde_json::json!(false));
    assert_eq!(value["failure"]["class"], serde_json::json!("document"));
    assert_eq!(value["failure"]["kind"], serde_json::json!("signature"));
    // The report rides the FAILED result — a caller told only "invalid"
    // cannot see which check said so, or what went unchecked.
    assert!(
        value["verification"].is_object(),
        "the report must survive a failing verdict: {value}"
    );
}

#[test]
fn an_unreadable_anchor_reports_a_failure_before_any_verdict() {
    let report = temp_path("verify-noanchor.json");
    let out = shojiku(&[
        "verify",
        "--input",
        &example_pdf(),
        "--anchor",
        &path_arg(temp_path("no-such-anchor.pem")),
        "--report",
        &path_arg(report.clone()),
    ]);
    assert!(!out.status.success());
    let value = read_report(&report);
    assert_eq!(value["ok"], serde_json::json!(false));
    assert_eq!(value["failure"]["step"], serde_json::json!("verify"));
    // No verdict was reached, so there is no report — a different fact
    // from an empty one.
    assert!(value.get("verification").is_none(), "{value}");
}
