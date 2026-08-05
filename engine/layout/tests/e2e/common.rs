//! Shared fixtures for the near-e2e layout suite: font/lang pack
//! loading, the `run` harness, and layout-tree extraction helpers.
//! Diagnostic-arg readers live in [`diag`].

use std::path::PathBuf;

mod diag;
pub use diag::{arg_num, args_all_numeric};

pub use serde_json::{json, Value};
pub use shojiku_core::{
    parse_definitions, parse_template, Catalog, MAX_CONTAINER_DEPTH, MAX_SPANS,
};
pub use shojiku_diagnostics::{Diagnostic, Diagnostics};
pub use shojiku_formatter::LangPack;
pub use shojiku_layout::{
    layout, FontStore, ImageShape, LayoutDocument, LayoutInput, LayoutItem, LayoutOutput,
    LayoutPage, LineShape, PathShape, RectShape, TextBlock,
};

/// Pinned copy of the engine's page cap (`engine::flow::MAX_PAGES`): the
/// cap is part of the observable contract these tests assert on.
pub const MAX_PAGES: usize = 500;

/// Pinned copy of the engine's resolved-length cap
/// (`shojiku_layout_box::MAX_RESOLVED_PT`), asserted as observable behavior.
pub const MAX_RESOLVED_PT: f64 = 1_000_000.0;

pub fn repo_font_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packs/fonts")
}

/// The shared ja font store. Loaded ONCE per test binary: loading
/// sha256-verifies every pack face (including the ~47MB IPAmj fallback),
/// so a per-test load turns the suite into gigabytes of hashing.
pub fn ja_store() -> &'static FontStore {
    static STORE: std::sync::OnceLock<FontStore> = std::sync::OnceLock::new();
    STORE.get_or_init(|| {
        FontStore::load_from_pack(&ja_pack(), &[repo_font_dir()]).expect("load fonts")
    })
}

/// The builtin ja-JP pack (locale chrome is compiled in; no file needed).
pub fn ja_pack() -> LangPack {
    LangPack::builtin("ja-JP", None)
        .expect("parse builtin ja-JP")
        .expect("builtin ja-JP exists")
}

pub fn run(template_yaml: &str, params: Value) -> (LayoutDocument, Diagnostics) {
    let out = run_output(template_yaml, params, None);
    (out.document, out.diagnostics)
}

/// Like [`run`] but keeps the full output (the path-addressed `BoxIndex`).
pub fn run_full(template_yaml: &str, params: Value) -> LayoutOutput {
    run_output(template_yaml, params, None)
}

/// [`run_full`] with an asset store (image items in box-index tests).
pub fn run_full_assets(
    template_yaml: &str,
    params: Value,
    assets: &shojiku_image::AssetStore,
) -> LayoutOutput {
    run_output(template_yaml, params, Some(assets))
}

pub fn run_with_assets(
    template_yaml: &str,
    params: Value,
    assets: Option<&shojiku_image::AssetStore>,
) -> (LayoutDocument, Diagnostics) {
    let out = run_output(template_yaml, params, assets);
    (out.document, out.diagnostics)
}

/// Runs layout with a catalog built from `definitions_yaml`, so
/// field-level behavior (`placeholder`, typed formatting) is exercised
/// the way the CLI runs it.
pub fn run_with_defs(
    template_yaml: &str,
    definitions_yaml: &str,
    params: Value,
) -> (LayoutDocument, Diagnostics) {
    let template = parse_template(template_yaml).expect("template");
    let defs = parse_definitions(definitions_yaml).expect("definitions");
    let catalog = Catalog::from_definitions(&defs);
    let pack = ja_pack();
    let fonts = ja_store();
    let input = LayoutInput {
        template: &template,
        params: &params,
        catalog: Some(&catalog),
        pack: &pack,
        fonts,
        assets: None,
    };
    let out = layout(&input);
    (out.document, out.diagnostics)
}

/// Runs layout against a caller-supplied font store (the pack still
/// provides locale formatting). Used to exercise face-variant
/// selection with a store that declares real bold/italic faces.
pub fn run_with_fonts(
    template_yaml: &str,
    params: Value,
    fonts: &shojiku_layout::FontStore,
) -> (LayoutDocument, Diagnostics) {
    let template = parse_template(template_yaml).expect("template");
    let pack = ja_pack();
    let input = LayoutInput {
        template: &template,
        params: &params,
        catalog: None,
        pack: &pack,
        fonts,
        assets: None,
    };
    let out = layout(&input);
    (out.document, out.diagnostics)
}

/// A store whose `sans` family has real regular + bold faces (both point
/// at the BIZUDPGothic-Regular.ttf bytes — the glyphs are identical, only
/// the variant selection is under test); `mono` has a regular only.
pub fn variant_font_store() -> shojiku_layout::FontStore {
    use shojiku_core::{FontStyle, FontWeight};
    use shojiku_layout::FontFace;
    let path = repo_font_dir().join("biz-ud/BIZUDPGothic-Regular.ttf");
    let face = |id: &str, family: &str, w: FontWeight, s: FontStyle| {
        FontFace::load(id, &path)
            .expect("load BIZUDPGothic-Regular")
            .with_variant(family.to_string(), w, s)
    };
    shojiku_layout::FontStore::from_faces(
        vec![
            face(
                "sans-regular",
                "sans",
                FontWeight::Normal,
                FontStyle::Normal,
            ),
            face("sans-bold", "sans", FontWeight::Bold, FontStyle::Normal),
            face(
                "mono-regular",
                "mono",
                FontWeight::Normal,
                FontStyle::Normal,
            ),
        ],
        "sans-regular",
    )
    .expect("variant store")
}

fn run_output(
    template_yaml: &str,
    params: Value,
    assets: Option<&shojiku_image::AssetStore>,
) -> LayoutOutput {
    let template = parse_template(template_yaml).expect("template");
    let pack = ja_pack();
    let fonts = ja_store();
    let input = LayoutInput {
        template: &template,
        params: &params,
        catalog: None,
        pack: &pack,
        fonts,
        assets,
    };
    layout(&input)
}

/// A store with one 10x10 raster under `src:logo.png` and one 20x10
/// SVG under `dyn:qr`.
pub fn test_assets() -> shojiku_image::AssetStore {
    use shojiku_image::{parse_svg, Asset, AssetKind, AssetStore, RasterFormat, SvgLimits};
    let mut store = AssetStore::empty();
    store.insert(Asset {
        id: "src:logo.png".to_string(),
        kind: AssetKind::Raster {
            format: RasterFormat::Png,
            bytes: std::sync::Arc::new(vec![0]),
            width_px: 10,
            height_px: 10,
        },
    });
    store.insert(Asset {
        id: "dyn:qr".to_string(),
        kind: AssetKind::Svg(
            parse_svg(r#"<svg viewBox="0 0 20 10"/>"#, &SvgLimits::default()).expect("svg"),
        ),
    });
    store
}

pub fn image_shapes(page: &LayoutPage) -> Vec<&ImageShape> {
    page.items
        .iter()
        .filter_map(|i| match i {
            LayoutItem::Image(shape) => Some(shape),
            _ => None,
        })
        .collect()
}

pub fn text_blocks(page: &LayoutPage) -> Vec<&TextBlock> {
    page.items
        .iter()
        .filter_map(|i| match i {
            LayoutItem::Text(t) => Some(t),
            _ => None,
        })
        .collect()
}

pub fn line_texts(block: &TextBlock) -> Vec<String> {
    block.lines.iter().map(|l| l.text.clone()).collect()
}

pub fn rect_shapes(page: &LayoutPage) -> Vec<&RectShape> {
    page.items
        .iter()
        .filter_map(|i| match i {
            LayoutItem::Rect(r) => Some(r),
            _ => None,
        })
        .collect()
}

pub fn line_shapes(page: &LayoutPage) -> Vec<&LineShape> {
    page.items
        .iter()
        .filter_map(|i| match i {
            LayoutItem::Line(l) => Some(l),
            _ => None,
        })
        .collect()
}

pub fn path_shapes(page: &LayoutPage) -> Vec<&PathShape> {
    page.items
        .iter()
        .filter_map(|i| match i {
            LayoutItem::Path(p) => Some(p),
            _ => None,
        })
        .collect()
}

pub fn all_text(page: &LayoutPage) -> String {
    text_blocks(page)
        .iter()
        .map(|t| {
            t.lines
                .iter()
                .map(|l| l.text.clone())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Builds an absolute-body template with `depth` nested containers
/// (each `box`-less) wrapping `innermost` item lines.
pub fn nested_containers_yaml(depth: usize, innermost: &str) -> String {
    let mut yaml =
        String::from("page: { margin: 0 }\nsections:\n  body:\n    type: absolute\n    items:\n");
    let mut indent = String::from("      ");
    for _ in 0..depth {
        yaml.push_str(&format!("{indent}- type: container\n{indent}  items:\n"));
        indent.push_str("    ");
    }
    for line in innermost.lines() {
        yaml.push_str(&format!("{indent}{line}\n"));
    }
    yaml
}

/// Finds the first text block whose first line equals `text`.
pub fn cell_pos(page: &LayoutPage, text: &str) -> (f64, f64) {
    let b = text_blocks(page)
        .into_iter()
        .find(|b| b.lines[0].text == text)
        .expect("cell text");
    (b.lines[0].x, b.lines[0].y)
}
