//! Tests for the request envelope — the schema an SDK is checked against.

use super::*;
use shojiku_image::AssetMode;

/// Parses, expecting the envelope to be accepted.
fn parsed(json: &str) -> Request {
    let Ok(request) = Request::parse(json) else {
        panic!("expected `{json}` to parse");
    };
    request
}

/// Parses, expecting a refusal, and returns its message.
fn refused(json: &str) -> String {
    let Err(Failure::InvalidRequest(message)) = Request::parse(json) else {
        panic!("expected `{json}` to be refused as an invalid request");
    };
    message
}

#[test]
fn the_smallest_envelope_is_a_template() {
    let request = parsed(r#"{"template":"version: 1"}"#);
    assert_eq!(request.template, "version: 1");
    assert!(request.definitions.is_none());
    assert!(request.params.is_none());
    assert!(request.page_index.is_none());
    assert_eq!(request.scale(), DEFAULT_SCALE);
    assert!(request.assets_root().is_none());
}

#[test]
fn every_documented_key_is_accepted() {
    // The header lists these; a key that stopped parsing would make that
    // documentation a lie no gate would otherwise catch.
    let request = parsed(
        r#"{
            "template": "t", "definitions": "d", "params": "{}",
            "lang": "en-US",
            "fontDirs": ["/a"], "localeDirs": ["/b"],
            "assetsDir": "/c", "assetMode": "bundled-only",
            "allowDynamicImage": ["logo"], "denyDynamicImage": ["seal"],
            "scale": 3.5, "pageIndex": 2
        }"#,
    );
    assert_eq!(request.definitions.as_deref(), Some("d"));
    assert_eq!(request.lang.as_deref(), Some("en-US"));
    assert_eq!(request.scale(), 3.5);
    assert_eq!(request.page_index, Some(2));
    assert_eq!(request.assets_root(), Some(Path::new("/c")));
    let Ok(policy) = request.asset_policy() else {
        panic!("bundled-only is a valid mode");
    };
    assert_eq!(policy.mode, AssetMode::BundledOnly);
    assert_eq!(policy.dynamic_allow, ["logo"]);
    assert_eq!(policy.dynamic_deny, ["seal"]);
}

#[test]
fn a_misspelled_key_names_itself_instead_of_being_ignored() {
    // The whole reason the schema denies unknown fields: an SDK author who
    // types `templat` has to find out from the library, not from a blank page.
    let message = refused(r#"{"templat":"t"}"#);
    assert!(
        message.contains("templat"),
        "the refusal must name the offending key, got: {message}"
    );
}

#[test]
fn a_missing_required_key_and_malformed_json_are_both_refused() {
    assert!(refused(r#"{"params":"{}"}"#).contains("template"));
    assert!(!refused("{not json").is_empty());
}

#[test]
fn laying_out_requires_params_and_validating_does_not() {
    let with = parsed(r#"{"template":"t","params":"{}"}"#);
    let Ok(params) = with.require_params() else {
        panic!("params were supplied");
    };
    assert_eq!(params, "{}");

    let without = parsed(r#"{"template":"t"}"#);
    let Err(Failure::InvalidRequest(message)) = without.require_params() else {
        panic!("laying out without params must be refused");
    };
    assert!(message.contains("`params` is required"));
}

#[test]
fn the_asset_mode_spellings_are_the_cli_s() {
    let Ok(default) = parsed(r#"{"template":"t"}"#).asset_policy() else {
        panic!("the default mode is valid");
    };
    assert_eq!(default.mode, AssetMode::Open);

    let Ok(open) = parsed(r#"{"template":"t","assetMode":"open"}"#).asset_policy() else {
        panic!("open is a valid mode");
    };
    assert_eq!(open.mode, AssetMode::Open);

    let request = parsed(r#"{"template":"t","assetMode":"sandboxed"}"#);
    let Err(Failure::InvalidRequest(message)) = request.asset_policy() else {
        panic!("an unknown mode must be refused");
    };
    // The refusal names what is accepted, never the rejected value: that
    // value is caller-controlled text.
    assert!(message.contains("bundled-only"));
    assert!(!message.contains("sandboxed"));
}

#[test]
fn each_dynamic_image_list_is_bounded() {
    // The policy rescans these per asset, so an unbounded list turns a
    // many-image template into work the caller chose the size of.
    for key in ["allowDynamicImage", "denyDynamicImage"] {
        let ids = (0..=MAX_ASSET_IDS)
            .map(|n| format!("\"id{n}\""))
            .collect::<Vec<_>>()
            .join(",");
        let message = refused(&format!(r#"{{"template":"t","{key}":[{ids}]}}"#));
        assert!(
            message.contains(key) && message.contains("cap"),
            "the {key} cap must name itself, got: {message}"
        );
    }
}

#[test]
fn a_scale_that_would_reach_the_rasterizer_as_nonsense_is_refused() {
    // Non-finite reaches the rasterizer's own arithmetic; a huge one is an
    // allocation request wearing a float.
    for scale in ["0", "-1", "1e308", "11"] {
        let message = refused(&format!(r#"{{"template":"t","scale":{scale}}}"#));
        assert!(
            message.contains("`scale`"),
            "scale {scale} must be refused by name, got: {message}"
        );
    }
    // JSON has no NaN literal, so the non-finite case is checked directly.
    let mut request = parsed(r#"{"template":"t"}"#);
    request.scale = Some(f64::NAN);
    assert!(request.check_scale().is_err());
}

#[test]
fn the_widest_accepted_scale_is_accepted() {
    // A cap creates a boundary value, and the boundary is admitted.
    let request = parsed(&format!(r#"{{"template":"t","scale":{MAX_SCALE}}}"#));
    assert_eq!(request.scale(), MAX_SCALE);
}

#[test]
fn request_dirs_come_before_the_environment_and_the_default() {
    // Same precedence the CLI gives its repeatable flags: earlier wins.
    let request = parsed(r#"{"template":"t","fontDirs":["/first"],"localeDirs":["/other"]}"#);
    let fonts = request.font_dirs();
    assert_eq!(
        fonts.first().map(PathBuf::as_path),
        Some(Path::new("/first"))
    );
    assert!(fonts.len() > 1, "the default search dir is still appended");

    let locales = request.locale_dirs();
    assert_eq!(
        locales.first().map(PathBuf::as_path),
        Some(Path::new("/other"))
    );
}
