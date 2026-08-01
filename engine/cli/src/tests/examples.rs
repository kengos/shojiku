//! Happy-path runs of each bundled example through the real pipeline:
//! validate, render to PDF, and preview to PNG.

use super::*;

#[test]
fn validates_example_cleanly() {
    let args = ValidateArgs {
        definitions: Some(examples_dir().join("definitions.yml")),
        templates: examples_dir().join("templates.yml"),
        params: Some(examples_dir().join("params.json")),
    };
    let diags = run_validate(&args).expect("validate");
    assert!(!diags.has_errors(), "diagnostics: {diags:?}");
}

#[test]
fn renders_example_to_pdf() {
    let rendered = run_render(&example_render_args()).expect("render");
    let bytes = rendered.bytes;
    assert!(bytes.starts_with(b"%PDF-"));
    // Subset CJK embedding: real glyph outlines, but nowhere near the
    // ~4.7 MB a full BIZ UD gothic embed would weigh.
    assert!(bytes.len() > 1_000, "suspiciously small: {}", bytes.len());
    assert!(bytes.len() < 300_000, "suspiciously large: {}", bytes.len());
}

#[test]
fn renders_us_receipt_on_a_custom_page_size() {
    let mut args = example_render_args();
    args.common.definitions = Some(us_examples_dir().join("definitions.yml"));
    args.common.templates = us_examples_dir().join("templates.yml");
    args.common.params = us_examples_dir().join("params.json");
    let rendered = run_render(&args).expect("render");
    assert!(rendered.bytes.starts_with(b"%PDF-"));

    // The 80mm thermal page size flows through to the layout tree.
    let json = run_inspect(&args.common).expect("inspect");
    let value: serde_json::Value = serde_json::from_str(&json).expect("json");
    let width = value["document"]["page_width"]
        .as_f64()
        .expect("page_width");
    assert!((width - 80.0 * 72.0 / 25.4).abs() < 1e-9, "got {width}");
    assert!(json.contains("THANK YOU FOR SHOPPING!"));
    // en-US locale + USD from the template `defaults:` drive $ currency
    // Formatting.
    assert!(json.contains("$20.56"));
}

#[test]
fn preview_renders_example_pages_to_png() {
    let outputs = run_preview(&example_preview_args()).expect("preview");
    assert_eq!(outputs.len(), 1);
    let (path, bytes) = &outputs[0];
    assert_eq!(path, "out-1.png");
    assert!(bytes.starts_with(b"\x89PNG"));
}

#[test]
fn preview_selects_a_single_page() {
    let mut args = example_preview_args();
    args.page = Some(1);
    args.output = "single.png".to_string();
    let outputs = run_preview(&args).expect("preview");
    assert_eq!(outputs.len(), 1);
    assert_eq!(outputs[0].0, "single.png");

    args.page = Some(99);
    assert!(matches!(
        run_preview(&args),
        Err(CliError::PageOutOfRange { page: 99, total: 1 })
    ));
}

#[test]
fn bundled_only_mode_rejects_the_examples_dynamic_qr() {
    let mut args = example_render_args();
    args.common.asset_mode = AssetModeArg::BundledOnly;
    assert!(matches!(
        run_render(&args),
        Err(CliError::ValidationFailed { .. })
    ));

    // Allow-listing the item id restores the render.
    args.common.allow_dynamic_image = vec!["verification_qr".to_string()];
    let rendered = run_render(&args).expect("render");
    assert!(rendered.bytes.starts_with(b"%PDF-"));
}
