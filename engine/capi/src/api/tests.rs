//! Tests for the entry points themselves: the argument checks a C caller
//! actually hits, and the panic shield at the real boundary.
//!
//! Document round trips live in `tests/capi` — these are about the frame
//! around the operation, not the operation.

use super::*;
use crate::input::MAX_REQUEST_BYTES;
use crate::request::Request;
use crate::result::shojiku_result_free;
use crate::status::{
    Failure, SHOJIKU_ERR_INVALID_REQUEST, SHOJIKU_ERR_INVALID_UTF8, SHOJIKU_ERR_NULL_ARG,
    SHOJIKU_ERR_PANIC, SHOJIKU_ERR_TOO_LARGE,
};

/// The shape every envelope-taking entry point has.
type DocumentEntry = unsafe extern "C" fn(*const u8, usize, *mut *mut ShojikuResult) -> i32;

/// Every entry point that takes a request envelope.
const DOCUMENT_ENTRIES: [(&str, DocumentEntry); 3] = [
    ("validate", shojiku_validate),
    ("render", shojiku_render),
    ("preview", shojiku_preview),
];

/// Calls an entry point and returns the status plus the handle's error JSON,
/// freeing the handle before returning.
fn call(entry: DocumentEntry, request: *const u8, len: usize) -> (i32, String) {
    let mut out: *mut ShojikuResult = std::ptr::null_mut();
    // SAFETY: `out` is a local slot; `request`/`len` describe either a live
    // buffer or the null case the entry point is being asked about.
    let status = unsafe { entry(request, len, &mut out) };
    // An assertion, not a branch: every entry point reached through this
    // helper hands back a handle whatever went wrong — that IS the contract,
    // so a null here is a bug to fail on rather than a case to handle.
    assert!(!out.is_null(), "an entry point handed back no handle");
    // SAFETY: `out` is the handle this call just produced, still alive.
    let error = unsafe { &*out }.error_for_test().to_string();
    // SAFETY: freed exactly once, and not read afterwards.
    unsafe { shojiku_result_free(out) };
    (status, error)
}

#[test]
fn an_operation_that_succeeds_hands_back_a_handle_with_its_payload() {
    // Every other test in this file is a refusal. Without this one the unit
    // suite never drives the success path at all, so the frame's "write the
    // result" half is only ever exercised from the integration binary.
    let mut out: *mut ShojikuResult = std::ptr::null_mut();
    // SAFETY: a local out-slot.
    let status = unsafe { shojiku_engine_info(&mut out) };
    assert_eq!(status, SHOJIKU_OK);
    assert!(!out.is_null());
    // SAFETY: the handle this call produced, still alive.
    let result = unsafe { &*out };
    assert_eq!(result.success_for_test(), 1);
    assert!(result.json_for_test().contains("capabilities"));
    assert!(result.error_for_test().is_empty());
    // SAFETY: freed exactly once.
    unsafe { shojiku_result_free(out) };
}

#[test]
fn the_abi_revision_is_reported() {
    // An SDK checks this before anything else, so it may never regress by
    // accident.
    assert_eq!(shojiku_abi_version(), 1);
    assert_eq!(shojiku_abi_version(), ABI_VERSION);
}

#[test]
fn a_null_out_slot_allocates_nothing_and_says_so() {
    // The one failure that cannot hand back a handle: there is nowhere to
    // put it.
    // SAFETY: passing null where the contract allows it to be checked.
    unsafe {
        assert_eq!(
            shojiku_engine_info(std::ptr::null_mut()),
            SHOJIKU_ERR_NULL_ARG
        );
        assert_eq!(
            shojiku_sign(
                b"%PDF".as_ptr(),
                4,
                b"key".as_ptr(),
                3,
                b"cert".as_ptr(),
                4,
                std::ptr::null(),
                0,
                std::ptr::null_mut()
            ),
            SHOJIKU_ERR_NULL_ARG
        );
    }
    for (name, entry) in DOCUMENT_ENTRIES {
        let request = br#"{"template":"t"}"#;
        // SAFETY: a live buffer and a deliberately null out-slot.
        let status = unsafe { entry(request.as_ptr(), request.len(), std::ptr::null_mut()) };
        assert_eq!(status, SHOJIKU_ERR_NULL_ARG, "{name} with a null out slot");
    }
}

#[test]
fn the_out_slot_is_blanked_before_any_work_starts() {
    // An SDK's cleanup path frees `*out` whatever happened; that is only
    // safe if a failed call cannot leave a stale value in it.
    let mut out: *mut ShojikuResult = std::ptr::dangling_mut();
    // SAFETY: a null request, which fails after the slot is blanked.
    let status = unsafe { shojiku_render(std::ptr::null(), 0, &mut out) };
    assert_eq!(status, SHOJIKU_ERR_NULL_ARG);
    assert!(!out.is_null(), "a failure still hands back its explanation");
    // SAFETY: freed exactly once.
    unsafe { shojiku_result_free(out) };
}

#[test]
fn every_entry_point_refuses_a_null_request_with_an_explanation() {
    for (name, entry) in DOCUMENT_ENTRIES {
        let (status, error) = call(entry, std::ptr::null(), 0);
        assert_eq!(status, SHOJIKU_ERR_NULL_ARG, "{name} with a null request");
        assert!(
            error.contains("null_argument") && error.contains("request"),
            "{name} must say which argument was null, got: {error}"
        );
    }
}

#[test]
fn every_entry_point_refuses_a_request_that_is_not_utf8() {
    // A lone continuation byte: legal bytes, illegal text.
    let hostile = [0x7b_u8, 0x80];
    for (name, entry) in DOCUMENT_ENTRIES {
        let (status, error) = call(entry, hostile.as_ptr(), hostile.len());
        assert_eq!(status, SHOJIKU_ERR_INVALID_UTF8, "{name} with non-UTF-8");
        assert!(error.contains("invalid_utf8"), "{name}: {error}");
    }
}

#[test]
fn every_entry_point_refuses_a_request_over_the_cap() {
    // The length is checked before the bytes are read, so a small buffer
    // with a huge declared length is refused rather than dereferenced.
    let small = b"{}";
    for (name, entry) in DOCUMENT_ENTRIES {
        let (status, error) = call(entry, small.as_ptr(), MAX_REQUEST_BYTES + 1);
        assert_eq!(status, SHOJIKU_ERR_TOO_LARGE, "{name} over the cap");
        assert!(error.contains("too_large"), "{name}: {error}");
    }
}

#[test]
fn every_entry_point_refuses_a_request_the_schema_rejects() {
    let hostile = br#"{"template":"t","scale":0}"#;
    for (name, entry) in DOCUMENT_ENTRIES {
        let (status, error) = call(entry, hostile.as_ptr(), hostile.len());
        assert_eq!(
            status, SHOJIKU_ERR_INVALID_REQUEST,
            "{name} with a rejected envelope"
        );
        assert!(error.contains("invalid_request"), "{name}: {error}");
    }
}

#[test]
fn signing_refuses_each_required_null_and_accepts_an_absent_passphrase() {
    let pdf = b"%PDF-1.7";
    let key = b"-----BEGIN PRIVATE KEY-----";
    let cert = b"-----BEGIN CERTIFICATE-----";
    // Each required argument nulled in turn; the passphrase left absent,
    // which is the unencrypted-key case and must NOT be an error.
    let cases: [(&str, *const u8, *const u8, *const u8); 3] = [
        ("pdf", std::ptr::null(), key.as_ptr(), cert.as_ptr()),
        ("key", pdf.as_ptr(), std::ptr::null(), cert.as_ptr()),
        ("certificate", pdf.as_ptr(), key.as_ptr(), std::ptr::null()),
    ];
    for (what, pdf_ptr, key_ptr, cert_ptr) in cases {
        let mut out: *mut ShojikuResult = std::ptr::null_mut();
        // SAFETY: one argument is null by design; the rest are live buffers.
        let status = unsafe {
            shojiku_sign(
                pdf_ptr,
                pdf.len(),
                key_ptr,
                key.len(),
                cert_ptr,
                cert.len(),
                std::ptr::null(),
                0,
                &mut out,
            )
        };
        assert_eq!(status, SHOJIKU_ERR_NULL_ARG, "a null `{what}`");
        // SAFETY: the handle this call produced, read then freed once.
        let error = unsafe { &*out }.error_for_test().to_string();
        assert!(
            error.contains(what),
            "the refusal must name `{what}`: {error}"
        );
        // SAFETY: freed exactly once.
        unsafe { shojiku_result_free(out) };
    }
}

#[test]
fn a_panic_inside_an_operation_becomes_a_status_not_an_unwind() {
    // Driven through the real `deliver` frame rather than the shield alone,
    // so what is proven is that the boundary a C caller crosses is shielded —
    // not merely that a helper somewhere catches panics.
    fn panicking(_: &Request) -> Result<ShojikuResult, Failure> {
        panic!("deliberate panic inside an operation");
    }
    let request = br#"{"template":"version: 1"}"#;
    let work = Work::document(request.as_ptr(), request.len(), panicking);
    let mut out: *mut ShojikuResult = std::ptr::null_mut();
    // SAFETY: a live request buffer and a local out-slot.
    let status = unsafe { deliver(&mut out, work) };
    assert_eq!(status, SHOJIKU_ERR_PANIC);
    // SAFETY: the handle this call produced, read then freed once.
    let error = unsafe { &*out }.error_for_test().to_string();
    assert!(error.contains("deliberate panic inside an operation"));
    assert!(error.contains("\"step\":\"panic\""));
    // SAFETY: freed exactly once.
    unsafe { shojiku_result_free(out) };
}
