//! PNG-backend tests: shared render harness and pixel probes.

mod clip;
mod decoration;
mod draw;
mod errors;
mod gradients;
mod marks;
mod pages;
mod patterns;
mod rasters;
mod raw;
mod spans;
mod vertical;
mod vertical_decoration;

use super::*;
use crate::paint::{build_path, pixmap_from_rgba};
use serde_json::json;
use shojiku_core::parse_template;
use shojiku_formatter::LangPack;
use shojiku_image::{AssetKind, PathCmd, RgbaImage};
use shojiku_layout::{layout, LayoutInput, LayoutPage};
use shojiku_layout::{ImageShape, LayoutItem, LineShape, RectShape, TextBlock};
use std::path::PathBuf;

pub(super) fn font_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packs/fonts")
}

pub(super) fn render(template_yaml: &str, params: serde_json::Value) -> Vec<Vec<u8>> {
    render_scaled(template_yaml, params, PngOptions::default())
}

pub(super) fn render_scaled(
    template_yaml: &str,
    params: serde_json::Value,
    options: PngOptions,
) -> Vec<Vec<u8>> {
    let template = parse_template(template_yaml).expect("template");
    let (pack, fonts) = shared_fonts();
    let (assets, diags) = shojiku_image::prepare_assets(
        &template,
        &params,
        &shojiku_image::AssetPolicy::default(),
        None,
    );
    assert!(!diags.has_errors(), "asset errors: {diags:?}");
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
    render_png(&doc, fonts, &assets, &options).expect("render")
}

/// Decodes a rendered PNG into (width, height, straight RGBA8).
pub(super) fn decode(bytes: &[u8]) -> (u32, u32, Vec<u8>) {
    let mut decoder = png::Decoder::new(std::io::Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().expect("png header");
    let mut buf = vec![0; reader.output_buffer_size().expect("buffer size")];
    let info = reader.next_frame(&mut buf).expect("png frame");
    buf.truncate(info.buffer_size());
    // tiny-skia always writes RGBA.
    assert_eq!(info.color_type, png::ColorType::Rgba);
    (info.width, info.height, buf)
}

pub(super) fn pixel(rgba: &[u8], w: u32, x: u32, y: u32) -> [u8; 4] {
    let i = ((y * w + x) * 4) as usize;
    [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]
}

/// A valid 1x1 red PNG (opaque), base64.
pub(super) fn png_1x1_red() -> String {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, 1, 1);
        enc.set_color(png::ColorType::Rgb);
        enc.set_depth(png::BitDepth::Eight);
        let mut w = enc.write_header().expect("hdr");
        w.write_image_data(&[255, 0, 0]).expect("data");
        w.finish().expect("fin");
    }
    STANDARD.encode(&out)
}

pub(super) fn base_doc() -> LayoutDocument {
    LayoutDocument {
        metadata: Default::default(),
        page_width: 100.0,
        page_height: 100.0,
        pages: vec![LayoutPage { items: vec![] }],
    }
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

pub(super) fn fonts() -> &'static FontStore {
    shared_fonts().1
}
