//! Argument wiring, the assets root, the per-call policy, and the pipeline
//! gate order.

use super::*;
use crate::test_support::{examples_dir, path_arg, read_example, server_args, temp_file};
use serde_json::json;
use shojiku_diagnostics::{Diagnostics, Severity};
use std::path::PathBuf;

fn parse_err(arguments: &Value) -> String {
    let Err((code, message)) = CallArgs::parse(arguments) else {
        panic!("expected invalid params");
    };
    assert_eq!(code, INVALID_PARAMS);
    message
}

fn prepare_failure(server: &ServerArgs, arguments: &Value) -> ToolFailure {
    let Ok(call) = CallArgs::parse(arguments) else {
        panic!("expected parsable args");
    };
    let Err(failure) = prepare_from(server, &call) else {
        panic!("expected a pipeline failure");
    };
    failure
}

fn diagnostics_of(failure: ToolFailure) -> Diagnostics {
    let ToolFailure::Diagnostics(diags) = failure else {
        panic!("expected a diagnostics failure");
    };
    diags
}

fn prepare_ok(arguments: &Value) -> PreparedDoc {
    let Ok(call) = CallArgs::parse(arguments) else {
        panic!("expected parsable args");
    };
    let Ok(doc) = prepare_from(&server_args(), &call) else {
        panic!("expected prepare to succeed");
    };
    doc
}

/// The bundled receipt's three sources, all inline.
fn inline_receipt() -> Value {
    json!({
        "definitions": read_example("definitions.yml"),
        "template": read_example("templates.yml"),
        "params": read_example("params.json"),
    })
}

/// The bundled receipt by path.
fn receipt_paths() -> Value {
    json!({
        "definitionsPath": path_arg(examples_dir().join("definitions.yml")),
        "templatePath": path_arg(examples_dir().join("templates.yml")),
        "paramsPath": path_arg(examples_dir().join("params.json")),
    })
}

/// An inline template with one bundled image `src`.
fn bundled_image_template(src: &str) -> String {
    format!("page: {{ margin: 0 }}\nsections:\n  body:\n    type: flow\n    box: {{ x: 0, y: 0, w: 500, h: 700 }}\n    items:\n      - type: image\n        src: {src}\n        box: {{ x: 0, y: 0, w: 50, h: 50 }}\n")
}

#[test]
fn call_args_require_a_template_and_params_source() {
    let message = parse_err(&json!({ "paramsPath": "p.json" }));
    assert!(
        message.contains("`template` or `templatePath` is required"),
        "{message}"
    );
    let message = parse_err(&json!({ "templatePath": "t.yml" }));
    assert!(
        message.contains("`params` or `paramsPath` is required"),
        "{message}"
    );
    let message = parse_err(&json!({ "templatePath": 5, "paramsPath": "p.json" }));
    assert!(
        message.contains("`templatePath` must be a string"),
        "{message}"
    );

    let args = json!({ "templatePath": "t.yml", "paramsPath": "p.json", "lang": null });
    let Ok(call) = CallArgs::parse(&args) else { panic!("expected parse") };
    assert_eq!(call.template.dir(), Some(PathBuf::from(".")));
    assert!(call.lang.is_none() && call.definitions.is_none());
}

#[test]
fn validation_errors_win_over_missing_font_packs() {
    // Gate order: a broken template reports its own diagnostics even when
    // the pack dirs are empty (environment errors must not mask them).
    let template = temp_file(
        "sourceless-image.yml",
        "page: { margin: 0 }\nsections:\n  body:\n    type: flow\n    box: { x: 0, y: 0, w: 500, h: 700 }\n    items:\n      - type: image\n        box: { x: 0, y: 0, w: 50, h: 50 }\n",
    );
    let params = temp_file("empty-params.json", "{}");
    let server = ServerArgs {
        font_dir: vec![PathBuf::from("/no/such/fonts")],
        locale_dir: vec![PathBuf::from("/no/such/locale")],
    };
    let arguments = json!({ "templatePath": template, "paramsPath": params });
    let diags = diagnostics_of(prepare_failure(&server, &arguments));
    assert!(diags.iter().any(|d| d.code == "image_source_missing"));
}

#[test]
fn parse_failures_surface_as_a_diagnostics_failure() {
    let arguments = json!({ "template": "sections: [not: a: map\n", "params": "{}" });
    let diags = diagnostics_of(prepare_failure(&server_args(), &arguments));
    assert!(diags.iter().any(|d| d.severity == Severity::Error));
}

#[test]
fn empty_inline_sources_answer_diagnostics_not_a_panic() {
    let diags = diagnostics_of(prepare_failure(
        &server_args(),
        &json!({ "template": "", "params": "" }),
    ));
    assert!(diags.iter().any(|d| d.severity == Severity::Error));
}

#[test]
fn locale_and_font_environment_failures_are_messages() {
    let template = temp_file(
        "plain.yml",
        "page: { margin: 0 }\nsections:\n  body:\n    type: flow\n    box: { x: 0, y: 0, w: 500, h: 700 }\n    items:\n      - type: text\n        text: hello\n",
    );
    let params = temp_file("empty-params3.json", "{}");
    let with_lang = json!({ "templatePath": template, "paramsPath": params, "lang": "fr-FR" });
    let ToolFailure::Message(message) = prepare_failure(&server_args(), &with_lang) else {
        panic!("expected a message failure");
    };
    assert!(message.contains("fr-FR"), "{message}");

    let server = ServerArgs {
        font_dir: vec![PathBuf::from("/no/such/fonts")],
        locale_dir: vec![crate::test_support::locale_dir()],
    };
    let no_lang = json!({ "templatePath": template, "paramsPath": params });
    let failure = prepare_failure(&server, &no_lang);
    assert!(matches!(failure, ToolFailure::Message(_)));
}

#[test]
fn missing_bundled_assets_are_a_diagnostics_failure() {
    // The asset stage runs after validation; a bundled image path that
    // does not exist fails `prepare` with diagnostics, not a message.
    let template = temp_file("ghost-image.yml", &bundled_image_template("no-such.png"));
    let params = temp_file("empty-params4.json", "{}");
    let arguments = json!({ "templatePath": template, "paramsPath": params });
    let failure = prepare_failure(&server_args(), &arguments);
    assert!(matches!(failure, ToolFailure::Diagnostics(_)));
}

#[test]
fn prepare_succeeds_on_the_bundled_example() {
    assert!(!prepare_ok(&receipt_paths())
        .prepared
        .document
        .pages
        .is_empty());
}

#[test]
fn inline_sources_prepare_like_their_paths_do() {
    let mut inline = inline_receipt();
    inline["assetsDir"] = json!(path_arg(examples_dir()));
    let from_inline = prepare_ok(&inline);
    let from_paths = prepare_ok(&receipt_paths());
    assert_eq!(
        from_inline.prepared.document.pages.len(),
        from_paths.prepared.document.pages.len()
    );
    assert_eq!(from_inline.prepared.title, from_paths.prepared.title);
}

#[test]
fn an_inline_template_without_an_assets_dir_has_no_bundled_root() {
    // No file to resolve siblings against: the bundled `src` answers the
    // actionable `assets_root_missing` rather than guessing a directory.
    let arguments = json!({
        "template": bundled_image_template("assets/logo.svg"),
        "params": "{}",
    });
    let diags = diagnostics_of(prepare_failure(&server_args(), &arguments));
    assert!(diags.iter().any(|d| d.code == "assets_root_missing"));
}

#[test]
fn an_assets_dir_gives_an_inline_template_its_bundled_root() {
    let arguments = json!({
        "template": bundled_image_template("assets/logo.svg"),
        "params": "{}",
        "assetsDir": path_arg(examples_dir()),
    });
    assert!(!prepare_ok(&arguments).prepared.document.pages.is_empty());
}

#[test]
fn an_assets_dir_overrides_the_template_files_own_directory() {
    // The template file sits next to no assets; `assetsDir` points at the
    // example's, so the bundled logo resolves anyway.
    let template = temp_file(
        "rooted-image.yml",
        &bundled_image_template("assets/logo.svg"),
    );
    let without = json!({ "templatePath": template.clone(), "params": "{}" });
    let failure = prepare_failure(&server_args(), &without);
    assert!(matches!(failure, ToolFailure::Diagnostics(_)));

    let with = json!({
        "templatePath": template,
        "params": "{}",
        "assetsDir": path_arg(examples_dir()),
    });
    assert!(!prepare_ok(&with).prepared.document.pages.is_empty());
}

#[test]
fn a_bundled_src_escaping_the_assets_dir_is_refused() {
    let arguments = json!({
        "template": bundled_image_template("../../../etc/passwd"),
        "params": "{}",
        "assetsDir": path_arg(examples_dir()),
    });
    let diags = diagnostics_of(prepare_failure(&server_args(), &arguments));
    assert!(diags.iter().any(|d| d.code == "asset_traversal"));
}

#[test]
fn a_hostile_assets_dir_is_never_echoed_raw() {
    // The failing root travels into the asset diagnostic's detail; it must
    // arrive stripped and bounded like any other attacker-controlled string.
    let hostile = format!("/no/such/{}\u{7}dir", "d".repeat(400));
    let arguments = json!({
        "template": bundled_image_template("logo.svg"),
        "params": "{}",
        "assetsDir": hostile,
    });
    let diags = diagnostics_of(prepare_failure(&server_args(), &arguments));
    let rendered = serde_json::to_string(&diags).expect("diagnostics JSON");
    assert!(!rendered.contains('\u{7}'), "{rendered}");
    for diag in diags.iter() {
        for value in diag.args.values() {
            let shojiku_diagnostics::ArgValue::Str(text) = value else {
                continue;
            };
            assert!(text.chars().count() <= 200, "{text}");
        }
    }
}

#[test]
fn bundled_only_mode_refuses_inline_dynamic_content_unless_allowed() {
    // The receipt's `verification_qr` item takes a params-supplied data URI.
    let mut arguments = receipt_paths();
    arguments["assetMode"] = json!("bundled-only");
    let diags = diagnostics_of(prepare_failure(&server_args(), &arguments));
    assert!(diags.iter().any(|d| d.code == "dynamic_image_denied"));

    arguments["allowDynamicImage"] = json!(["verification_qr"]);
    assert!(!prepare_ok(&arguments).prepared.document.pages.is_empty());
}

#[test]
fn a_denied_item_is_refused_even_under_the_open_default() {
    let mut arguments = receipt_paths();
    arguments["denyDynamicImage"] = json!(["verification_qr"]);
    let diags = diagnostics_of(prepare_failure(&server_args(), &arguments));
    assert!(diags.iter().any(|d| d.code == "dynamic_image_denied"));
}
