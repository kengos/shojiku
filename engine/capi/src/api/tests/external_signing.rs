//! The two-step signing entry points and `shojiku_verify`, called through
//! their `extern "C"` signatures: one successful round trip (prepare, sign
//! `toBeSigned` in the test with a key the entry points are never given,
//! complete, verify), and the null-argument refusals each of the three entry
//! points returns before it reads the PDF.
//!
//! The integration suite in `tests/capi` covers the algorithms, chains and
//! tamper cases. This suite exists so that the capi crate's OWN test binary
//! also calls these three `#[unsafe(no_mangle)]` functions: a
//! `#[unsafe(no_mangle)]` function that no unit test calls has an execution
//! count of 0 in the capi unit test binary's coverage record, and llvm-cov
//! may report the unit binary's record instead of the integration binary's.

use super::*;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use serde_json::json;
use shojiku_signing::PrivateKey;
use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

const RSA: &[u8] = b"rsa-pkcs1-sha256";

fn repo_path(relative: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(relative)
}

/// Generates the test key material once per test process, with the same
/// script the integration suite and the signing crate use. The `OnceLock`
/// is required: when tests run in parallel, the key-generation script would
/// otherwise rewrite key files that another test is reading.
fn key_bytes(name: &str) -> Vec<u8> {
    static KEYS: OnceLock<PathBuf> = OnceLock::new();
    let dir = KEYS.get_or_init(|| {
        let dir =
            std::env::temp_dir().join(format!("shojiku-capi-unit-keys-{}", std::process::id()));
        let output = Command::new("sh")
            .arg(repo_path("scripts/gen-test-keys.sh"))
            .arg(&dir)
            .output()
            .expect("running the test-key generator");
        assert!(output.status.success(), "the test-key generator failed");
        dir
    });
    std::fs::read(dir.join(name)).expect("a generated key file")
}

/// Owns a result handle for one test and frees it when dropped.
struct Handle(*mut ShojikuResult);

impl Handle {
    fn result(&self) -> &ShojikuResult {
        // SAFETY: the handle was produced by an entry point and is freed only
        // when this value is dropped.
        unsafe { &*self.0 }
    }
}

impl Drop for Handle {
    fn drop(&mut self) {
        // SAFETY: freed exactly once, and not read afterwards.
        unsafe { shojiku_result_free(self.0) };
    }
}

/// Renders the bundled receipt example through `shojiku_render`.
fn rendered_receipt() -> Vec<u8> {
    let dir = repo_path("examples/business/receipt-ja");
    let read = |name: &str| std::fs::read_to_string(dir.join(name)).expect("an example source");
    let request = serde_json::to_vec(&json!({
        "template": read("templates.yml"),
        "definitions": read("definitions.yml"),
        "params": read("params.json"),
        "fontDirs": [repo_path("packs/fonts").to_str().expect("a UTF-8 path")],
        "localeDirs": [repo_path("packs/locale").to_str().expect("a UTF-8 path")],
        "assetsDir": dir.to_str().expect("a UTF-8 path"),
    }))
    .expect("an envelope serializes");
    let mut out: *mut ShojikuResult = std::ptr::null_mut();
    // SAFETY: a live request buffer and a local out-slot.
    let status = unsafe { shojiku_render(request.as_ptr(), request.len(), &mut out) };
    let handle = Handle(out);
    assert_eq!(status, SHOJIKU_OK, "{}", handle.result().error_for_test());
    handle.result().pdf_for_test().to_vec()
}

fn prepare(pdf: &[u8], certificate: &[u8], algorithm: &[u8]) -> (i32, Handle) {
    let mut out: *mut ShojikuResult = std::ptr::null_mut();
    // SAFETY: every pair describes a live buffer and `out` is a local slot.
    let status = unsafe {
        shojiku_sign_prepare(
            pdf.as_ptr(),
            pdf.len(),
            certificate.as_ptr(),
            certificate.len(),
            algorithm.as_ptr(),
            algorithm.len(),
            &mut out,
        )
    };
    (status, Handle(out))
}

fn complete(pdf: &[u8], certificate: &[u8], signature: &[u8]) -> (i32, Handle) {
    let mut out: *mut ShojikuResult = std::ptr::null_mut();
    // SAFETY: every pair describes a live buffer and `out` is a local slot.
    let status = unsafe {
        shojiku_sign_complete(
            pdf.as_ptr(),
            pdf.len(),
            certificate.as_ptr(),
            certificate.len(),
            RSA.as_ptr(),
            RSA.len(),
            signature.as_ptr(),
            signature.len(),
            &mut out,
        )
    };
    (status, Handle(out))
}

fn verify(pdf: &[u8], anchors: &[u8]) -> (i32, Handle) {
    let mut out: *mut ShojikuResult = std::ptr::null_mut();
    // SAFETY: both pairs describe live buffers and `out` is a local slot.
    let status = unsafe {
        shojiku_verify(
            pdf.as_ptr(),
            pdf.len(),
            anchors.as_ptr(),
            anchors.len(),
            &mut out,
        )
    };
    (status, Handle(out))
}

#[test]
fn a_signature_computed_by_the_caller_completes_into_a_pdf_that_verify_accepts() {
    let pdf = rendered_receipt();
    let certificate = key_bytes("rsa2048.cert.pem");

    let (status, prepared) = prepare(&pdf, &certificate, RSA);
    assert_eq!(status, SHOJIKU_OK, "{}", prepared.result().error_for_test());
    let result = prepared.result();
    assert_eq!(result.success_for_test(), 1);
    // A prepare produces a JSON payload and no document.
    assert!(result.pdf_for_test().is_empty());
    assert_eq!(result.diagnostics_for_test(), "{\"items\":[]}");
    let payload: serde_json::Value =
        serde_json::from_str(result.json_for_test()).expect("the payload is JSON");
    let decode = |key: &str| {
        let text = payload[key].as_str().expect("a base64 string");
        STANDARD.decode(text).expect("valid base64")
    };
    // The digest is the SHA-256 of the bytes `byteRange` covers; it is not the bytes to sign.
    assert_eq!(decode("digest").len(), 32);
    assert_ne!(decode("digest"), decode("toBeSigned"));
    assert_eq!(payload["byteRange"].as_array().map(Vec::len), Some(4));
    assert!(payload["capacity"].as_u64().expect("a capacity") > 0);

    // This test signs `toBeSigned` with the private key directly, in place of
    // an external key service.
    let signature = PrivateKey::from_pem(&key_bytes("rsa2048.key.pem"), None)
        .expect("the test key loads")
        .sign(&decode("toBeSigned"))
        .expect("the test key signs");

    let (status, completed) = complete(&pdf, &certificate, &signature);
    assert_eq!(
        status,
        SHOJIKU_OK,
        "{}",
        completed.result().error_for_test()
    );
    let signed = completed.result().pdf_for_test();
    assert_eq!(completed.result().success_for_test(), 1);
    // Completing produces a document and no JSON payload.
    assert!(completed.result().json_for_test().is_empty());
    // Signing appends a revision: the original bytes are kept as they were.
    assert!(signed.len() > pdf.len());
    assert_eq!(&signed[..pdf.len()], &pdf[..]);

    let (status, verified) = verify(signed, &certificate);
    assert_eq!(status, SHOJIKU_OK, "{}", verified.result().error_for_test());
    assert_eq!(verified.result().success_for_test(), 1);
    let report: serde_json::Value =
        serde_json::from_str(verified.result().json_for_test()).expect("the report is JSON");
    assert_eq!(report["valid"], json!(true));
    assert!(verified.result().error_for_test().is_empty());
}

#[test]
fn verifying_a_pdf_with_no_signature_is_an_unsuccessful_result_with_no_report() {
    let (status, verified) = verify(&rendered_receipt(), &key_bytes("rsa2048.cert.pem"));

    // A document that cannot be verified is an outcome carried on the
    // result, not a refusal of the call.
    assert_eq!(status, SHOJIKU_OK);
    assert_eq!(verified.result().success_for_test(), 0);
    assert!(verified.result().json_for_test().is_empty());
    let error = verified.result().error_for_test();
    assert!(error.contains("\"step\":\"verify\""), "{error}");
    assert!(error.contains("\"kind\":\"document\""), "{error}");
}

#[test]
fn a_null_out_slot_is_refused_by_all_three_entry_points() {
    let buffer = b"x";
    let (pdf, len) = (buffer.as_ptr(), buffer.len());
    // SAFETY: every pair describes a live buffer; the out slot is null on
    // purpose, which each entry point checks before anything else.
    unsafe {
        let prepared = shojiku_sign_prepare(pdf, len, pdf, len, pdf, len, std::ptr::null_mut());
        let completed =
            shojiku_sign_complete(pdf, len, pdf, len, pdf, len, pdf, len, std::ptr::null_mut());
        let verified = shojiku_verify(pdf, len, pdf, len, std::ptr::null_mut());
        assert_eq!(prepared, SHOJIKU_ERR_NULL_ARG);
        assert_eq!(completed, SHOJIKU_ERR_NULL_ARG);
        assert_eq!(verified, SHOJIKU_ERR_NULL_ARG);
    }
}

#[test]
fn a_null_pdf_pointer_is_refused_by_all_three_entry_points_and_named() {
    let buffer = b"x";
    let (ptr, len) = (buffer.as_ptr(), buffer.len());
    let null = std::ptr::null();
    let mut slots = [std::ptr::null_mut::<ShojikuResult>(); 3];
    let [prepare_slot, complete_slot, verify_slot] = &mut slots;
    // SAFETY: the pdf pointer is null on purpose; every other pair is a live
    // buffer and each out slot is a local one.
    let statuses = unsafe {
        [
            shojiku_sign_prepare(null, 0, ptr, len, ptr, len, prepare_slot),
            shojiku_sign_complete(null, 0, ptr, len, ptr, len, ptr, len, complete_slot),
            shojiku_verify(null, 0, ptr, len, verify_slot),
        ]
    };
    for (status, slot) in statuses.into_iter().zip(slots) {
        assert_eq!(status, SHOJIKU_ERR_NULL_ARG);
        // Each entry point writes a result handle whose error names the null argument.
        let handle = Handle(slot);
        let error = handle.result().error_for_test();
        assert!(
            error.contains("null_argument") && error.contains("pdf"),
            "{error}"
        );
    }
}
