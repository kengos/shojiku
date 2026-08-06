//! CLI tests: shared example/fixture helpers.

mod args;
mod envelope;
mod examples;
mod flags;
mod pipeline;

use super::*;
use crate::commands::{output_error, write_stream};
use std::path::PathBuf;
use std::process::Command as Spawn;
use std::sync::OnceLock;

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
            font_pack: Vec::new(),
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

/// The generated key material for this test process.
///
/// Shared by every suite that signs, so the generator runs ONCE: it is merely
/// idempotent, not safe beside itself, because it writes its completion
/// sentinel last.
pub(super) fn key_dir() -> &'static PathBuf {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| {
        let dir =
            std::env::temp_dir().join(format!("shojiku-cli-sign-keys-{}", std::process::id()));
        let script =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../scripts/gen-test-keys.sh");
        let output = Spawn::new("sh")
            .arg(&script)
            .arg(&dir)
            .output()
            .unwrap_or_else(|error| panic!("could not run {}: {error}", script.display()));
        assert!(output.status.success(), "the key generator failed");
        dir
    })
}

/// A committed example's rendered output — a document this engine produced,
/// which is the only shape the signing surface accepts.
pub(super) fn example_pdf() -> PathBuf {
    examples_dir().join("output.pdf")
}
