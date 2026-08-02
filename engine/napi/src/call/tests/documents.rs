//! Engine info and rendering: what crosses, and which level a failure lands
//! on.

use super::*;

#[test]
fn engine_info_comes_back_as_the_authoring_layer_s_own_payload() {
    let outcome = engine_info();
    assert_eq!(outcome.status, shojiku_capi::SHOJIKU_OK);
    assert!(outcome.success);
    // Unmodelled on purpose — the SDK hands the caller a plain object, so the
    // engine can append a key without a change in seven languages.
    assert!(outcome.json.contains("\"capabilities\""));
    assert!(outcome.pdf.is_empty());
}

#[test]
fn a_render_carries_pdf_bytes_its_page_count_and_its_diagnostics() {
    let outcome = render(&receipt_request());
    assert_eq!(outcome.status, shojiku_capi::SHOJIKU_OK);
    assert!(outcome.success, "error: {}", outcome.error);
    assert!(outcome.pdf.starts_with(b"%PDF-"));
    assert!(outcome.json.contains("\"pageCount\":1"));
    // Present on success too: a render that worked can still have warnings.
    assert_eq!(outcome.diagnostics, "{\"items\":[]}");
    assert!(outcome.error.is_empty());
}

#[test]
fn the_bytes_are_the_ones_the_c_abi_path_produces() {
    // The node SDK's whole determinism promise is that it renders what every
    // other host renders. This host reaches the engine through the C entry
    // points, so the claim is checkable rather than assumed.
    let request = receipt_request();
    let through_this_host = render(&request);

    let mut handle = std::ptr::null_mut();
    // SAFETY: a live request buffer and one local out-slot.
    let status = unsafe { shojiku_render(request.as_ptr(), request.len(), &mut handle) };
    assert_eq!(status, shojiku_capi::SHOJIKU_OK);
    // SAFETY: the handle the call above wrote, read and freed exactly once.
    let direct = unsafe { read(status, handle) };

    assert_eq!(through_this_host.pdf, direct.pdf);
}

#[test]
fn a_document_the_engine_refuses_is_a_failed_outcome_not_a_caller_error() {
    // An image item with neither `src` nor `data` — a structural error, so it
    // does not need a definitions fixture to reach error severity.
    let outcome = render(&envelope(json!({
        "template": "version: 1\nsections:\n  body:\n    type: flow\n    items:\n      - type: image\n",
        "params": "{}",
        "fontDirs": [path_str(&repo_path("packs/fonts"))],
        "localeDirs": [path_str(&repo_path("packs/locale"))],
    })));
    // The status is the level that matters: the caller did nothing wrong, so
    // the SDK returns a failed result here rather than raising.
    assert_eq!(outcome.status, shojiku_capi::SHOJIKU_OK);
    assert!(!outcome.success);
    assert!(outcome.diagnostics.contains("image_source_missing"));
    assert!(outcome.error.contains("\"step\":\"render\""));
}

#[test]
fn an_envelope_the_schema_rejects_is_a_caller_error() {
    let outcome = render(&envelope(json!({ "template": "x", "nosuchkey": 1 })));
    // Non-zero: the SDK raises for this level, and the status crosses
    // unchanged so it can tell which mistake it was.
    assert_eq!(outcome.status, shojiku_capi::SHOJIKU_ERR_INVALID_REQUEST);
    assert!(!outcome.success);
    assert!(outcome.error.contains("nosuchkey"));
}

#[test]
fn an_envelope_missing_a_required_key_is_a_caller_error_too() {
    // The sibling case to the unknown-key test above, and a DIFFERENT serde
    // failure: `template` is required, and omitting it must reach the caller
    // as the same caller-error status rather than as a document that failed.
    let outcome = render(&envelope(json!({ "params": "{}" })));
    assert_eq!(outcome.status, shojiku_capi::SHOJIKU_ERR_INVALID_REQUEST);
    assert!(!outcome.success);
    assert!(outcome.error.contains("template"));
}

#[test]
fn request_bytes_that_are_not_utf8_are_a_status_rather_than_a_panic() {
    let outcome = render(&[0xff, 0xfe, 0xfd]);
    assert_eq!(outcome.status, shojiku_capi::SHOJIKU_ERR_INVALID_UTF8);
    assert!(!outcome.success);
}
