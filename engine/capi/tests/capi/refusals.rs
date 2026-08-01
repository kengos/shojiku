//! What the engine and its environment REFUSE, and how each refusal reaches
//! the caller: a document problem as diagnostics, a host-side cause as a
//! named `{step, kind}`, and caller misuse as a status. The split from
//! `documents.rs` is by outcome, not by entry point — these are the cases an
//! SDK has to turn into a failed result rather than a returned artifact.

use super::*;

#[test]
fn a_template_the_engine_refuses_comes_back_as_diagnostics_not_a_status() {
    // The heart of the two-level split: the caller did nothing wrong, the
    // document did. An SDK must surface this as a result, not an exception.
    // `image_source_missing` is an ERROR that needs no definitions to fire.
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
        "params": "{}",
        "fontDirs": [path(repo_path("packs/fonts"))],
        "localeDirs": [path(repo_path("packs/locale"))],
    }));

    let (status, out) = call(shojiku_render, &request);
    assert_eq!(
        status, SHOJIKU_OK,
        "a refused document is not a usage error"
    );
    assert!(!succeeded(out), "the document should have been refused");
    assert!(
        diagnostics_of(out).contains("image_source_missing"),
        "diagnostics: {} / error: {}",
        diagnostics_of(out),
        error_of(out)
    );
    assert!(error_of(out).contains("\"step\":\"render\""));
    free(out);
}

#[test]
fn an_unparsable_template_is_a_host_cause_on_the_render_step() {
    let request = envelope(serde_json::json!({
        "template": "version: 1\n  bad: [indentation",
        "params": "{}",
    }));
    let (status, out) = call(shojiku_render, &request);
    assert_eq!(status, SHOJIKU_OK);
    assert!(!succeeded(out));
    assert!(error_of(out).contains("\"kind\":\"parse\""));
    free(out);
}

#[test]
fn laying_out_without_params_is_refused_by_the_schema() {
    // `validate` accepts a template alone; rendering it cannot.
    let request = envelope(serde_json::json!({ "template": "version: 1" }));
    let (status, out) = call(shojiku_render, &request);
    assert_eq!(status, SHOJIKU_ERR_INVALID_REQUEST);
    assert!(error_of(out).contains("`params` is required"));
    free(out);
}

#[test]
fn a_locale_with_no_pack_names_what_it_looked_for() {
    let mut request: serde_json::Value =
        serde_json::from_slice(&receipt_request()).expect("envelope parses");
    request["lang"] = serde_json::json!("zz-ZZ");

    let (status, out) = call(shojiku_render, &envelope(request));
    assert_eq!(status, SHOJIKU_OK, "a missing pack is an outcome");
    assert!(!succeeded(out));
    assert!(error_of(out).contains("locale_pack"));
    free(out);
}

#[test]
fn a_pack_whose_face_file_is_missing_fails_differently_from_a_missing_pack() {
    // Two distinct failures a caller should be able to tell apart: the pack
    // could not be FOUND (`font_pack`, below) versus the pack was found and
    // its face bytes could not be READ (`font`, here). A manifest with no
    // font files beside it produces the second.
    // Every manifest, no font files beside them — the locale names more than
    // one pack, and a pack that is simply absent would fail earlier with the
    // other error, which is the one this test exists to be distinct from.
    let dir = temp_dir("faceless-pack");
    let mut copied = 0;
    for entry in std::fs::read_dir(repo_path("packs/fonts")).expect("the font packs") {
        let pack = entry.expect("a pack entry").path();
        let manifest = pack.join("manifest.yml");
        if !manifest.is_file() {
            continue;
        }
        let out = dir.join(pack.file_name().expect("a pack name"));
        std::fs::create_dir_all(&out).expect("a pack dir");
        std::fs::copy(&manifest, out.join("manifest.yml")).expect("the manifest");
        copied += 1;
    }
    assert!(
        copied > 1,
        "copied {copied} manifests, expected the whole set"
    );

    let mut request: serde_json::Value =
        serde_json::from_slice(&receipt_request()).expect("envelope parses");
    request["fontDirs"] = serde_json::json!([path(dir)]);

    let (status, out) = call(shojiku_render, &envelope(request));
    assert_eq!(status, SHOJIKU_OK);
    assert!(!succeeded(out));
    assert!(
        error_of(out).contains("\"kind\":\"font\""),
        "{}",
        error_of(out)
    );
    free(out);
}

#[test]
fn a_bundled_image_with_no_assets_directory_is_refused_at_prepare_time() {
    // Passes validation — `src` is set, which is all validation can check
    // without a filesystem — and fails when the assets are actually
    // resolved. That is a different stage from the parse/validate gate, and
    // it still comes back as diagnostics rather than a usage error.
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
            "        src: logo.svg\n",
        ),
        "params": "{}",
        "fontDirs": [path(repo_path("packs/fonts"))],
        "localeDirs": [path(repo_path("packs/locale"))],
    }));

    let (status, out) = call(shojiku_render, &request);
    assert_eq!(status, SHOJIKU_OK);
    assert!(!succeeded(out));
    assert!(
        diagnostics_of(out).contains("assets_root_missing"),
        "diagnostics: {}",
        diagnostics_of(out)
    );
    free(out);
}

#[test]
fn a_font_pack_that_is_not_installed_is_a_failure_never_a_download() {
    // The library has no network surface at all; this is what that looks
    // like from the outside.
    let mut request: serde_json::Value =
        serde_json::from_slice(&receipt_request()).expect("envelope parses");
    request["fontDirs"] = serde_json::json!([path(temp_dir("nofonts"))]);

    let (status, out) = call(shojiku_render, &envelope(request));
    assert_eq!(status, SHOJIKU_OK);
    assert!(!succeeded(out));
    assert!(error_of(out).contains("font_pack"), "{}", error_of(out));
    free(out);
}

// ---- shojiku_verify ------------------------------------------------
//
// Verification's own outcomes live in `verifying.rs`; what belongs HERE is
// the other level — the call the surface refuses outright, which an SDK
// raises on rather than turning into a result.

#[test]
fn every_null_argument_is_caller_misuse_rather_than_a_verdict() {
    let anchors = key_bytes("rsa2048.cert.pem");
    let mut out: *mut ShojikuResult = std::ptr::null_mut();

    // SAFETY: a null `pdf` with a non-zero length is exactly what the null
    // check exists for; `anchors` and `out` are live.
    let status = unsafe {
        shojiku_verify(
            std::ptr::null(),
            10,
            anchors.as_ptr(),
            anchors.len(),
            &mut out,
        )
    };
    assert_eq!(status, SHOJIKU_ERR_NULL_ARG);
    assert!(error_of(out).contains("`pdf` must not be null"));
    free(out);

    // SAFETY: as above, with the null on the other argument.
    let status = unsafe { shojiku_verify(b"%PDF".as_ptr(), 4, std::ptr::null(), 10, &mut out) };
    assert_eq!(status, SHOJIKU_ERR_NULL_ARG);
    assert!(error_of(out).contains("`anchors` must not be null"));
    free(out);

    // SAFETY: a null `out` slot, which the frame rejects before any work —
    // and, since nothing was written, there is nothing to free.
    let status = unsafe {
        shojiku_verify(
            b"%PDF".as_ptr(),
            4,
            anchors.as_ptr(),
            anchors.len(),
            std::ptr::null_mut(),
        )
    };
    assert_eq!(status, SHOJIKU_ERR_NULL_ARG);
}

#[test]
fn an_argument_over_its_cap_is_refused_before_a_byte_is_read() {
    let anchors = key_bytes("rsa2048.cert.pem");
    let mut out: *mut ShojikuResult = std::ptr::null_mut();

    // A LIE about the length, which is what the cap defends against: the
    // check happens before the pointer is ever dereferenced, so no read
    // follows and nothing is undefined.
    // SAFETY: the length is over the cap, so `input::bytes` rejects it
    // without touching the pointer — the one case where a length may exceed
    // the buffer.
    let status = unsafe {
        shojiku_verify(
            b"%PDF".as_ptr(),
            64 * 1024 * 1024 + 1,
            anchors.as_ptr(),
            anchors.len(),
            &mut out,
        )
    };
    assert_eq!(status, SHOJIKU_ERR_TOO_LARGE);
    let error = error_of(out);
    assert!(
        error.contains("too_large") && error.contains("pdf"),
        "{error}"
    );
    free(out);

    // SAFETY: as above, on the anchors argument.
    let status = unsafe {
        shojiku_verify(
            b"%PDF".as_ptr(),
            4,
            anchors.as_ptr(),
            64 * 1024 + 1,
            &mut out,
        )
    };
    assert_eq!(status, SHOJIKU_ERR_TOO_LARGE);
    let error = error_of(out);
    assert!(
        error.contains("too_large") && error.contains("anchors"),
        "{error}"
    );
    free(out);
}
