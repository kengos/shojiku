//! Page selection math, argument guards, and rasterization through the
//! bundled example (PNG payloads + the diagnostics part).

use super::*;
use crate::test_support::{call_tool, content, diag_items, examples_dir, path_arg, temp_file};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde_json::json;

fn example_args() -> Value {
    json!({
        "definitionsPath": path_arg(examples_dir().join("definitions.yml")),
        "templatePath": path_arg(examples_dir().join("templates.yml")),
        "paramsPath": path_arg(examples_dir().join("params.json")),
    })
}

/// Decodes a base64 PNG part and returns its IHDR pixel width.
fn png_width(part: &Value) -> u32 {
    assert_eq!(part["type"], "image");
    assert_eq!(part["mimeType"], "image/png");
    let bytes = STANDARD
        .decode(part["data"].as_str().expect("base64"))
        .expect("decode");
    assert!(bytes.starts_with(b"\x89PNG"), "not a PNG payload");
    u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]])
}

#[test]
fn renders_the_example_with_images_then_diagnostics() {
    let result = call_tool("render_preview", example_args()).expect("preview");
    assert_eq!(result["isError"], false);
    let parts = content(&result);
    assert_eq!(parts.len(), 2, "one page + diagnostics: {parts:?}");
    assert!(png_width(&parts[0]) > 100);
    assert_eq!(diag_items(&parts[1]), json!([]));
}

#[test]
fn scale_drives_the_raster_size() {
    let mut args = example_args();
    args["scale"] = json!(1.0);
    let small = call_tool("render_preview", args.clone()).expect("preview");
    args["scale"] = json!(2.0);
    let large = call_tool("render_preview", args).expect("preview");
    let small_w = png_width(&content(&small)[0]);
    let large_w = png_width(&content(&large)[0]);
    assert!(
        (i64::from(large_w) - 2 * i64::from(small_w)).abs() <= 2,
        "scale 2 should double the width: {small_w} vs {large_w}"
    );
}

#[test]
fn page_selection_and_out_of_range() {
    let mut args = example_args();
    args["page"] = json!(1);
    let result = call_tool("render_preview", args.clone()).expect("preview");
    assert_eq!(content(&result).len(), 2);

    args["page"] = json!(99);
    let result = call_tool("render_preview", args).expect("preview");
    assert_eq!(result["isError"], true);
    let text = content(&result)[0]["text"].as_str().expect("text");
    assert!(text.contains("page 99 is out of range"), "{text}");
}

#[test]
fn selection_arguments_are_type_checked() {
    let mut args = example_args();
    args["page"] = json!("one");
    assert!(call_tool("render_preview", args.clone()).is_err());
    args["page"] = json!(0);
    assert!(call_tool("render_preview", args.clone()).is_err());
    args["page"] = json!(1.5);
    assert!(call_tool("render_preview", args.clone()).is_err());
    args["page"] = json!(null);
    args["scale"] = json!("big");
    assert!(call_tool("render_preview", args).is_err());
}

#[test]
fn render_stage_failures_surface_in_band() {
    let mut args = example_args();
    args["scale"] = json!(0.0);
    let result = call_tool("render_preview", args).expect("call succeeds");
    assert_eq!(result["isError"], true);
}

#[test]
fn warnings_ride_along_on_success() {
    let template = temp_file(
        "p-ghost.yml",
        "page: { margin: 0 }\nsections:\n  body:\n    type: flow\n    box: { x: 0, y: 0, w: 500, h: 700 }\n    items:\n      - type: text\n        data: { key: order.ghost }\n",
    );
    let params = temp_file("p-empty.json", "{}");
    let result = call_tool(
        "render_preview",
        json!({ "templatePath": template, "paramsPath": params }),
    )
    .expect("preview");
    assert_eq!(result["isError"], false);
    let parts = content(&result);
    let diags = diag_items(parts.last().expect("diagnostics part"));
    assert_eq!(diags[0]["code"], "missing_data");
}

#[test]
fn select_pages_is_capped_without_an_explicit_page() {
    assert_eq!(select_pages(3, None), Ok(vec![0, 1, 2]));
    assert_eq!(select_pages(3, Some(2)), Ok(vec![1]));
    let over = MAX_PREVIEW_PAGES + 1;
    let err = select_pages(over, None).unwrap_err();
    assert!(err.contains("pass `page`"), "{err}");
    let err = select_pages(3, Some(4)).unwrap_err();
    assert!(err.contains("out of range"), "{err}");
    // The cap never blocks an explicit page.
    assert_eq!(select_pages(over, Some(over)), Ok(vec![over - 1]));
}
