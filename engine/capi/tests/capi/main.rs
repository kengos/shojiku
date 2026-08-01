//! End-to-end tests of the C ABI, driven the way a binding drives it:
//! through the exported symbols and the real accessors, never through the
//! crate's internals. Anything an SDK cannot do, these tests do not do.
//!
//! Shared fixtures and the accessor helpers live here; the suites are the
//! sibling modules.

mod documents;
mod header;
mod refusals;
mod signing;
mod threading;
mod verifying;

use serde_json::json;
use shojiku_capi::*;
use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

/// A buffer accessor's C signature.
type BufferAccessor = unsafe extern "C" fn(*const ShojikuResult, *mut *const u8, *mut usize) -> i32;

fn repo_path(relative: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(relative)
}

/// The request envelope for one bundled example, pointing at the repository's
/// own packs — the same inputs `make examples` renders with.
fn example_request(example: &str) -> Vec<u8> {
    let dir = repo_path("examples/business").join(example);
    let read =
        |name: &str| std::fs::read_to_string(dir.join(name)).expect("an example source file");
    envelope(json!({
        "template": read("templates.yml"),
        "definitions": read("definitions.yml"),
        "params": read("params.json"),
        "fontDirs": [path(repo_path("packs/fonts"))],
        "localeDirs": [path(repo_path("packs/locale"))],
        "assetsDir": path(dir.clone()),
    }))
}

/// The single-page example most of the suite runs against.
fn receipt_request() -> Vec<u8> {
    example_request("receipt-ja")
}

/// An example that lays out onto SEVERAL pages, so a page count cannot be
/// mistaken for a constant.
fn multi_page_request() -> Vec<u8> {
    example_request("catalog-ja")
}

/// Serializes an envelope to the bytes an entry point takes.
fn envelope(value: serde_json::Value) -> Vec<u8> {
    serde_json::to_vec(&value).expect("an envelope serializes")
}

fn path(path: PathBuf) -> String {
    path.to_str().expect("utf8 path").to_string()
}

/// Runs an envelope-taking entry point, returning the status and the handle.
/// The handle is the caller's to free, exactly as it is in C.
fn call(
    entry: unsafe extern "C" fn(*const u8, usize, *mut *mut ShojikuResult) -> i32,
    request: &[u8],
) -> (i32, *mut ShojikuResult) {
    let mut out: *mut ShojikuResult = std::ptr::null_mut();
    // SAFETY: `request` is a live buffer and `out` is a local slot.
    let status = unsafe { entry(request.as_ptr(), request.len(), &mut out) };
    (status, out)
}

/// Copies out what a buffer accessor lent.
fn buffer(accessor: BufferAccessor, handle: *const ShojikuResult) -> Vec<u8> {
    let mut ptr: *const u8 = std::ptr::null();
    let mut len: usize = 0;
    // SAFETY: a live handle and two local out-slots.
    let status = unsafe { accessor(handle, &mut ptr, &mut len) };
    assert_eq!(status, SHOJIKU_OK, "an accessor on a live handle");
    if len == 0 {
        return Vec::new();
    }
    // SAFETY: the accessor reported `len` readable bytes at `ptr`, borrowed
    // from a handle that is still alive.
    unsafe { std::slice::from_raw_parts(ptr, len) }.to_vec()
}

/// The result's `success` flag.
fn succeeded(handle: *const ShojikuResult) -> bool {
    let mut success: i32 = -1;
    // SAFETY: a live handle and a local out-slot.
    let status = unsafe { shojiku_result_success(handle, &mut success) };
    assert_eq!(status, SHOJIKU_OK);
    success == 1
}

/// The result's page count.
fn page_count(handle: *const ShojikuResult) -> usize {
    let mut count: usize = 0;
    // SAFETY: a live handle and a local out-slot.
    let status = unsafe { shojiku_result_page_count(handle, &mut count) };
    assert_eq!(status, SHOJIKU_OK);
    count
}

fn diagnostics_of(handle: *const ShojikuResult) -> String {
    String::from_utf8(buffer(shojiku_result_diagnostics_json, handle)).expect("utf8 diagnostics")
}

/// The result's JSON payload — engine info, a render's page count, or a
/// verification report, depending on which operation produced the handle.
fn json_of(handle: *const ShojikuResult) -> String {
    String::from_utf8(buffer(shojiku_result_json, handle)).expect("utf8 json")
}

fn error_of(handle: *const ShojikuResult) -> String {
    String::from_utf8(buffer(shojiku_result_error_json, handle)).expect("utf8 error")
}

/// A fresh directory for one test, keyed by process so parallel runs of the
/// suite cannot see each other's.
fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("shojiku-capi-{name}-{}", std::process::id()));
    std::fs::remove_dir_all(&dir).ok();
    std::fs::create_dir_all(&dir).expect("a temp dir");
    dir
}

/// Generates key material into a per-process directory, ONCE.
///
/// The `OnceLock` is load-bearing, not tidiness: tests run in parallel, and
/// the generator writes its completion sentinel last, so two concurrent runs
/// both decide the directory is unfinished and rewrite the key files while a
/// third test is reading them. Serialising here is what makes the suite
/// deterministic (the signing crate's own testkit does the same).
fn keys() -> &'static PathBuf {
    static KEYS: OnceLock<PathBuf> = OnceLock::new();
    KEYS.get_or_init(|| {
        let dir = std::env::temp_dir().join(format!("shojiku-capi-keys-{}", std::process::id()));
        let script = repo_path("scripts/gen-test-keys.sh");
        let output = Command::new("sh")
            .arg(&script)
            .arg(&dir)
            .output()
            .expect("running the test-key generator");
        assert!(output.status.success(), "the test-key generator failed");
        dir
    })
}

fn key_bytes(name: &str) -> Vec<u8> {
    std::fs::read(keys().join(name)).expect("a generated key file")
}

/// Renders the bundled receipt, so signing runs over bytes this engine
/// actually produced rather than a committed fixture.
fn rendered_receipt() -> Vec<u8> {
    let (status, out) = call(shojiku_render, &receipt_request());
    assert_eq!(status, SHOJIKU_OK, "error: {}", error_of(out));
    let pdf = buffer(shojiku_result_pdf, out);
    free(out);
    pdf
}

/// Calls `shojiku_sign`, returning the status and the handle.
fn sign(
    pdf: &[u8],
    key: &[u8],
    certificate: &[u8],
    passphrase: Option<&[u8]>,
) -> (i32, *mut ShojikuResult) {
    let (pass_ptr, pass_len) = match passphrase {
        Some(bytes) => (bytes.as_ptr(), bytes.len()),
        None => (std::ptr::null(), 0),
    };
    let mut out: *mut ShojikuResult = std::ptr::null_mut();
    // SAFETY: every pair describes a live buffer; the passphrase is null
    // exactly when it is absent, and `out` is a local slot.
    let status = unsafe {
        shojiku_sign(
            pdf.as_ptr(),
            pdf.len(),
            key.as_ptr(),
            key.len(),
            certificate.as_ptr(),
            certificate.len(),
            pass_ptr,
            pass_len,
            &mut out,
        )
    };
    (status, out)
}

/// Calls `shojiku_verify`, returning the status and the handle.
fn verify(pdf: &[u8], anchors: &[u8]) -> (i32, *mut ShojikuResult) {
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
    (status, out)
}

/// Renders the bundled receipt and signs it with `key`/`cert`.
fn signed_receipt(key: &str, cert: &str) -> Vec<u8> {
    let pdf = rendered_receipt();
    let (status, out) = sign(&pdf, &key_bytes(key), &key_bytes(cert), None);
    assert_eq!(status, SHOJIKU_OK, "error: {}", error_of(out));
    assert!(succeeded(out), "error: {}", error_of(out));
    let signed = buffer(shojiku_result_pdf, out);
    free(out);
    signed
}

/// Frees a handle. Every test path ends in exactly one of these — the paired
/// free IS the ownership contract, so leaving one out is the bug.
fn free(handle: *mut ShojikuResult) {
    // SAFETY: a handle this library produced, freed exactly once and never
    // read afterwards.
    unsafe { shojiku_result_free(handle) };
}
