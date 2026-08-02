//! CLI tests: shared example/fixture helpers.

mod args;
mod envelope;
mod examples;
mod pipeline;

use super::*;
use crate::commands::{output_error, write_stream};
use std::path::PathBuf;

pub(super) fn examples_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/business/receipt-ja")
}

pub(super) fn us_examples_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/business/receipt-us")
}

pub(super) fn font_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packs/fonts")
}

pub(super) fn locale_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packs/locale")
}

pub(super) fn example_render_args() -> RenderArgs {
    RenderArgs {
        common: RenderishArgs {
            definitions: Some(examples_dir().join("definitions.yml")),
            templates: examples_dir().join("templates.yml"),
            params: examples_dir().join("params.json"),
            lang: None,
            font_dir: vec![font_dir()],
            locale_dir: vec![locale_dir()],
            assets_dir: None,
            asset_mode: AssetModeArg::Open,
            allow_dynamic_image: Vec::new(),
            deny_dynamic_image: Vec::new(),
            offline: false,
            font_fetch_allow: Vec::new(),
        },
        output: "-".to_string(),
        report: ReportArg::default(),
    }
}

/// Writes a uniquely named temp file and returns its path.
pub(super) fn temp_file(name: &str, content: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("shojiku-cli-test-{}-{name}", std::process::id()));
    std::fs::write(&path, content).expect("write temp file");
    path
}

pub(super) fn example_preview_args() -> PreviewArgs {
    PreviewArgs {
        common: example_render_args().common,
        output: "out-{page}.png".to_string(),
        scale: 1.0,
        page: None,
    }
}
