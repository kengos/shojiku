//! Round trips through every document entry point, against the bundled
//! receipt — the same sources `make examples` renders.

use super::*;

#[test]
fn the_abi_revision_is_what_a_binding_checks_first() {
    // Asserted from the INTEGRATION side deliberately: an exported symbol's
    // body is only measured in the copy a C caller links, so a unit test
    // alone leaves it unexercised where it counts.
    assert_eq!(shojiku_abi_version(), 1);
}

#[test]
fn freeing_null_is_a_no_op_for_a_c_caller_too() {
    // An SDK's ensure/finally block frees whatever it holds, and after a
    // failed call that is NULL. Same reason as above for testing it here.
    // SAFETY: a null handle is explicitly a no-op.
    unsafe { shojiku_result_free(std::ptr::null_mut()) };
}

#[test]
fn engine_info_reports_what_this_build_can_do() {
    let mut out: *mut ShojikuResult = std::ptr::null_mut();
    // SAFETY: a local out-slot.
    let status = unsafe { shojiku_engine_info(&mut out) };
    assert_eq!(status, SHOJIKU_OK);
    assert!(succeeded(out));

    let json = String::from_utf8(buffer(shojiku_result_json, out)).expect("utf8 engine info");
    let info: serde_json::Value = serde_json::from_str(&json).expect("engine info parses");
    assert!(info["capabilities"]
        .as_array()
        .is_some_and(|k| !k.is_empty()));
    assert!(info["builtinLocales"]
        .as_array()
        .is_some_and(|l| !l.is_empty()));

    // The drift guard: this host must not grow a capability list of its own.
    // Compared as VALUES, so pretty-printing is not part of the contract.
    let canonical: serde_json::Value =
        serde_json::from_str(&shojiku_authoring::run_capabilities().expect("capabilities JSON"))
            .expect("canonical capabilities parse");
    assert_eq!(info, canonical);
    free(out);
}

#[test]
fn validating_the_receipt_succeeds_and_still_hands_back_diagnostics() {
    let (status, out) = call(shojiku_validate, &receipt_request());
    assert_eq!(status, SHOJIKU_OK);
    assert!(succeeded(out));
    // Present on success too: a document that validates can still warn.
    let diagnostics: serde_json::Value =
        serde_json::from_str(&diagnostics_of(out)).expect("diagnostics parse");
    assert!(diagnostics["items"].is_array());
    assert!(error_of(out).is_empty(), "a success carries no cause");
    free(out);
}

#[test]
fn validating_a_broken_template_fails_without_becoming_a_usage_error() {
    // `validate` is the lenient path — a document it refuses still comes back
    // as status OK with the diagnostics attached, because an editor calling
    // this on every keystroke needs to render the problem, not catch it.
    let request = envelope(serde_json::json!({
        "template": concat!(
            "version: 0.1.0\n",
            "sections:\n",
            "  body:\n",
            "    type: flow\n",
            "    box: { x: 0, y: 0, w: 400, h: 400 }\n",
            "    items:\n",
            "      - id: logo\n",
            "        type: image\n",
            "        box: { x: 0, y: 0, w: 40, h: 40 }\n",
        ),
    }));
    let (status, out) = call(shojiku_validate, &request);
    assert_eq!(status, SHOJIKU_OK);
    assert!(!succeeded(out));
    assert!(diagnostics_of(out).contains("image_source_missing"));
    assert!(error_of(out).contains("\"step\":\"validate\""));
    free(out);
}

#[test]
fn rendering_the_receipt_produces_a_pdf() {
    let (status, out) = call(shojiku_render, &receipt_request());
    assert_eq!(status, SHOJIKU_OK, "error: {}", error_of(out));
    assert!(succeeded(out), "error: {}", error_of(out));

    let pdf = buffer(shojiku_result_pdf, out);
    assert!(pdf.starts_with(b"%PDF-"), "the bytes must be a PDF");
    assert!(pdf.len() > 1024, "a receipt is more than a header");

    // The artifact metadata every SDK exposes. It rides the JSON payload
    // because the page-count ACCESSOR counts a preview's PNG buffers, and
    // redefining that would move the ABI revision instead of appending.
    let payload: serde_json::Value = serde_json::from_str(&json_of(out)).expect("a page count");
    assert_eq!(payload["pageCount"], json!(1));
    assert_eq!(
        page_count(out),
        0,
        "a render carries no rasterized pages, whatever the document's length"
    );
    free(out);
}

#[test]
fn a_multi_page_render_reports_every_page_it_laid_out() {
    // The single-page case above cannot tell a real count from a constant.
    let (status, out) = call(shojiku_render, &multi_page_request());
    assert_eq!(status, SHOJIKU_OK, "error: {}", error_of(out));
    assert!(succeeded(out), "error: {}", error_of(out));

    let payload: serde_json::Value = serde_json::from_str(&json_of(out)).expect("a page count");
    let pages = payload["pageCount"].as_u64().expect("a number");
    assert!(pages > 1, "expected several pages, got {pages}");

    // And the same document previewed rasterizes exactly that many, which is
    // what pins the count to the document rather than to the renderer.
    let (status, preview) = call(shojiku_preview, &multi_page_request());
    assert_eq!(status, SHOJIKU_OK, "error: {}", error_of(preview));
    assert_eq!(
        page_count(preview),
        usize::try_from(pages).expect("a count")
    );
    free(preview);
    free(out);
}

#[test]
fn signing_reports_no_page_count_because_it_laid_nothing_out() {
    // Signing appends a revision to bytes it never measured. An empty payload
    // is the honest answer; a zero would read as "a document with no pages".
    let pdf = rendered_receipt();
    let (status, out) = sign(
        &pdf,
        &key_bytes("rsa2048.key.pem"),
        &key_bytes("rsa2048.cert.pem"),
        None,
    );
    assert_eq!(status, SHOJIKU_OK, "error: {}", error_of(out));
    assert_eq!(json_of(out), "");
    free(out);
}

#[test]
fn previewing_rasterizes_every_page_by_default() {
    let (status, out) = call(shojiku_preview, &receipt_request());
    assert_eq!(status, SHOJIKU_OK, "error: {}", error_of(out));
    assert!(succeeded(out));

    let pages = page_count(out);
    assert!(pages >= 1);
    for index in 0..pages {
        let mut ptr: *const u8 = std::ptr::null();
        let mut len: usize = 0;
        // SAFETY: a live handle, an in-range index, and local out-slots.
        let status = unsafe { shojiku_result_page_png(out, index, &mut ptr, &mut len) };
        assert_eq!(status, SHOJIKU_OK);
        // SAFETY: `len` readable bytes at `ptr`, borrowed from a live handle.
        let png = unsafe { std::slice::from_raw_parts(ptr, len) };
        assert!(png.starts_with(b"\x89PNG"), "page {index} must be a PNG");
    }
    free(out);
}

#[test]
fn previewing_one_page_rasterizes_only_that_page() {
    let mut request: serde_json::Value =
        serde_json::from_slice(&receipt_request()).expect("envelope parses");
    request["pageIndex"] = serde_json::json!(0);
    request["scale"] = serde_json::json!(1.0);

    let (status, out) = call(shojiku_preview, &envelope(request));
    assert_eq!(status, SHOJIKU_OK, "error: {}", error_of(out));
    assert_eq!(page_count(out), 1, "only the requested page is rasterized");
    free(out);
}

#[test]
fn a_page_index_past_the_end_is_caller_misuse_not_a_document_problem() {
    let mut request: serde_json::Value =
        serde_json::from_slice(&receipt_request()).expect("envelope parses");
    request["pageIndex"] = serde_json::json!(9999);

    let (status, out) = call(shojiku_preview, &envelope(request));
    assert_eq!(status, SHOJIKU_ERR_OUT_OF_RANGE);
    assert!(!succeeded(out));
    assert!(error_of(out).contains("out_of_range"));
    free(out);
}
