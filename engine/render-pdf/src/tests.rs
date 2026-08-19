//! PDF-backend tests: shared render harness.

mod clip;
mod decoration;
mod docs;
mod fonts;
mod images;
mod invisible;
mod links;
mod marks;
mod metadata;
mod patterns;
mod spans;
mod vertical;
mod vertical_decoration;

use super::*;
use crate::draw::*;
use crate::text::{em_advance, italic_skew, map_glyphs};
use serde_json::json;
use shojiku_core::parse_template;
use shojiku_formatter::LangPack;
use shojiku_image::RasterFormat;
use shojiku_layout::{layout, LayoutInput};
use shojiku_layout::{ImageShape, LayoutItem};
use std::path::PathBuf;

pub(super) fn font_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packs/fonts")
}

/// Shared pack + store, loaded once per test binary (loading
/// sha256-verifies every face, incl. the ~47MB IPAmj fallback).
pub(super) fn shared_fonts() -> (&'static LangPack, &'static FontStore) {
    static CELL: std::sync::OnceLock<(LangPack, FontStore)> = std::sync::OnceLock::new();
    let (pack, fonts) = CELL.get_or_init(|| {
        let pack = LangPack::builtin("ja-JP", None)
            .expect("parse builtin ja-JP")
            .expect("builtin ja-JP exists");
        let fonts = FontStore::load_from_pack(&pack, &[font_dir()]).expect("fonts");
        (pack, fonts)
    });
    (pack, fonts)
}

pub(super) fn render_template(template_yaml: &str, params: serde_json::Value) -> Vec<u8> {
    let template = parse_template(template_yaml).expect("template");
    let (pack, fonts) = shared_fonts();
    let (assets, asset_diags) = shojiku_image::prepare_assets(
        &template,
        &params,
        &shojiku_image::AssetPolicy::default(),
        None,
    );
    assert!(!asset_diags.has_errors(), "asset errors: {asset_diags:?}");
    let input = LayoutInput {
        template: &template,
        params: &params,
        catalog: None,
        pack,
        fonts,
        assets: Some(&assets),
    };
    let out = layout(&input);
    let (doc, diags) = (out.document, out.diagnostics);
    assert!(!diags.has_errors(), "layout errors: {diags:?}");
    render_pdf(&doc, fonts, &assets).expect("render")
}
