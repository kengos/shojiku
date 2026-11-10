//! The asset-source harness the `image_source` fuzz target and the corpus
//! replay test both run.
//!
//! A params value bound to an image item can name a bundled asset, carry a
//! data URI or inline SVG, or be an `http(s)` URL, and the host's
//! `AssetPolicy` decides which of those may become an asset. The harness
//! loads one such value through `prepare_assets_injected`, over a fixed
//! template and a fixed map of injected files, and asserts the source
//! rules: a remote URL never becomes an asset; a bundled path becomes one
//! exactly when it has no `..` or root component and names an injected
//! file within the caps, and a `..` or absolute path is reported as
//! traversal; a denied item, or inline content the policy does not allow,
//! becomes no asset; an asset is within the byte and pixel caps; and a
//! second load of the same value gives the same asset and the same
//! diagnostics.

use super::tree::assert_tree;
use crate::policy::{AssetMode, AssetPolicy};
use crate::prepare_assets_injected;
use crate::store::{AssetKind, AssetStore};
use serde_json::json;
use shojiku_core::{Template, parse_template};
use shojiku_diagnostics::{DiagnosticCode as Code, Diagnostics};
use std::collections::BTreeMap;
use std::sync::OnceLock;

#[cfg(test)]
mod tests;

/// The id of the template's one image item, as the `allow` and `deny`
/// settings name it.
const ITEM_ID: &str = "logo";

/// The store key of that item's asset (`dyn:<params key>`).
const ASSET_KEY: &str = "dyn:img";

/// A 1x1 RGB PNG (69 bytes).
const PNG: [u8; 69] = [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x10, 0x50, 0x30, 0x00,
    0x00, 0x00, 0xa4, 0x00, 0x61, 0x34, 0x66, 0x7d, 0x72, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
    0x44, 0xae, 0x42, 0x60, 0x82,
];

/// An SVG with one filled square.
const SVG: &str = r##"<svg viewBox="0 0 8 8"><rect width="8" height="8" fill="#123456"/></svg>"##;

/// The injected files: path, bytes, and the pixel count of a raster
/// (`None` for an SVG, which the pixel cap does not apply to).
fn injected_files() -> [(&'static str, &'static [u8], Option<u64>); 3] {
    [
        ("logo.png", &PNG, Some(1)),
        ("logo.svg", SVG.as_bytes(), None),
        ("sub/mark.png", &PNG, Some(1)),
    ]
}

/// Which branches one input ran, for the replay test's positive controls.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct SourcePaths {
    /// An `http(s)` URL was refused.
    pub remote: bool,
    /// A bundled path was refused as traversal.
    pub traversal: bool,
    /// A bundled path loaded an injected file.
    pub bundled: bool,
    /// A data URI loaded a raster.
    pub data_raster: bool,
    /// A data URI loaded an SVG.
    pub data_svg: bool,
    /// Inline SVG markup loaded an SVG.
    pub inline_svg: bool,
    /// The item is on the policy's deny list, and no asset was loaded.
    pub denied_item: bool,
    /// Inline content was refused because the mode is bundled-only and the
    /// item is not on the allow list.
    pub inline_refused_by_mode: bool,
    /// A bundled path named an injected file that is over the byte or pixel
    /// cap, and no asset was loaded. A data URI over a cap does not set
    /// this flag; `assert_caps` checks the caps on every loaded asset.
    pub capped: bool,
}

/// Reads the policy from the first input line: `mode=open|bundled`,
/// `allow=<id>`, `deny=<id>`, `bytes=<cap>` and `px=<cap>`, separated by
/// spaces; anything else keeps the default policy's value.
fn settings(line: &str) -> AssetPolicy {
    let mut policy = AssetPolicy::default();
    for (key, value) in line.split(' ').filter_map(|token| token.split_once('=')) {
        match key {
            "mode" if value == "bundled" => policy.mode = AssetMode::BundledOnly,
            "allow" => policy.dynamic_allow.push(value.to_string()),
            "deny" => policy.dynamic_deny.push(value.to_string()),
            "bytes" => policy.max_asset_bytes = value.parse().unwrap_or(policy.max_asset_bytes),
            "px" => policy.max_pixels = value.parse().unwrap_or(policy.max_pixels),
            _ => {}
        }
    }
    policy
}

/// Loads one fuzz input's params value and asserts the source rules. The
/// first line holds the policy settings (see [`settings`]); the rest
/// of the input, after that line's `\n`, is the params value.
///
/// # Panics
///
/// Panics when a rule fails; the message names it.
pub fn source(input: &str) -> SourcePaths {
    let (line, value) = input.split_once('\n').unwrap_or((input, ""));
    let policy = settings(line);
    let (store, diags) = load(value, &policy);
    let (again, again_diags) = load(value, &policy);
    assert!(
        summary(&store) == summary(&again) && diags == again_diags,
        "loading the same value twice gave different results"
    );
    let asset = store.get(ASSET_KEY).map(|a| &a.kind);
    let codes: Vec<Code> = diags.items.iter().map(|d| d.code).collect();
    if let Some(kind) = asset {
        assert_caps(kind, value, &policy);
    }
    check_rules(value.trim(), asset, &codes, &policy)
}

/// Asserts the rule for the value's source form and returns which branch
/// the value ran.
fn check_rules(
    trimmed: &str,
    asset: Option<&AssetKind>,
    codes: &[Code],
    policy: &AssetPolicy,
) -> SourcePaths {
    let mut paths = SourcePaths::default();
    if policy.dynamic_deny.iter().any(|id| id == ITEM_ID) {
        assert!(asset.is_none(), "a denied item received an asset");
        assert!(
            codes.contains(&Code::DynamicImageDenied),
            "a denied item was not reported"
        );
        paths.denied_item = true;
    } else if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        assert!(asset.is_none(), "a remote URL became an asset");
        assert!(
            codes.contains(&Code::RemoteAssetUnsupported),
            "a remote URL was not reported"
        );
        paths.remote = true;
    } else if is_inline(trimmed) {
        let allowed =
            policy.mode == AssetMode::Open || policy.dynamic_allow.iter().any(|id| id == ITEM_ID);
        if !allowed {
            assert!(
                asset.is_none(),
                "inline content became an asset under bundled mode"
            );
            assert!(
                codes.contains(&Code::DynamicImageDenied),
                "refused inline content was not reported"
            );
            paths.inline_refused_by_mode = true;
        }
        let data = trimmed.starts_with("data:");
        paths.data_raster = data && matches!(asset, Some(AssetKind::Raster { .. }));
        paths.data_svg = data && matches!(asset, Some(AssetKind::Svg(_)));
        paths.inline_svg = !data && asset.is_some();
    } else {
        check_bundled(trimmed, asset, codes, policy, &mut paths);
        paths.bundled = asset.is_some();
    }
    paths
}

/// Whether a trimmed value is inline content (a data URI or markup).
fn is_inline(trimmed: &str) -> bool {
    trimmed.starts_with("data:") || trimmed.starts_with('<')
}

/// Asserts the bundled-path rule and sets `traversal` or `capped` in
/// `paths`. The path is split on `/` with empty and `.` segments dropped,
/// which is how `std::path::Path::components` splits it on Unix (the split
/// the engine's `confined_key` uses); on Windows `\` and drive prefixes
/// split differently, and the fuzz targets run on Linux only. A path that
/// starts with `/` or has a `..` segment must be refused as traversal.
fn check_bundled(
    rel: &str,
    asset: Option<&AssetKind>,
    codes: &[Code],
    policy: &AssetPolicy,
    paths: &mut SourcePaths,
) {
    let segments: Vec<&str> = rel
        .split('/')
        .filter(|s| !s.is_empty() && *s != ".")
        .collect();
    if rel.starts_with('/') || segments.contains(&"..") {
        assert!(
            asset.is_none(),
            "the traversal path `{rel}` became an asset"
        );
        assert!(
            codes.contains(&Code::AssetTraversal),
            "the traversal path `{rel}` was not reported"
        );
        paths.traversal = true;
        return;
    }
    let key = segments.join("/");
    let file = injected_files().into_iter().find(|(path, ..)| *path == key);
    let loads = file.is_some_and(|(_, bytes, pixels)| {
        bytes.len() <= policy.max_asset_bytes && pixels.is_none_or(|p| p <= policy.max_pixels)
    });
    paths.capped = file.is_some() && !loads;
    assert_eq!(
        asset.is_some(),
        loads,
        "the bundled path `{rel}` (key `{key}`) loaded: {}, expected: {loads}",
        asset.is_some()
    );
}

/// Asserts an asset is within the byte and pixel caps, and an SVG asset
/// keeps the tree limits. The SVG asset's markup is the value itself,
/// base64 in the value (which decodes to fewer bytes), or the injected
/// [`SVG`], so the path-command bound is the larger of `value.len()` and
/// `SVG.len()`.
fn assert_caps(kind: &AssetKind, value: &str, policy: &AssetPolicy) {
    match kind {
        AssetKind::Raster {
            bytes,
            width_px,
            height_px,
            ..
        } => {
            assert!(
                bytes.len() <= policy.max_asset_bytes,
                "a raster asset is over the byte cap"
            );
            assert!(
                width_px.saturating_mul(*height_px) <= policy.max_pixels,
                "a raster asset is over the pixel cap"
            );
        }
        AssetKind::Svg(tree) => assert_tree(tree, value.len().max(SVG.len())),
    }
}

/// The item's asset by its `Debug` text, for comparing two loads.
fn summary(store: &AssetStore) -> Option<String> {
    store.get(ASSET_KEY).map(|a| format!("{:?}", a.kind))
}

/// Loads `value` as the params value of the template's image item.
fn load(value: &str, policy: &AssetPolicy) -> (AssetStore, Diagnostics) {
    prepare_assets_injected(template(), &json!({ "img": value }), policy, injected())
}

/// The template: one image item, id [`ITEM_ID`], bound to params `img`.
fn template() -> &'static Template {
    static TEMPLATE: OnceLock<Template> = OnceLock::new();
    TEMPLATE.get_or_init(|| {
        parse_template(
            "sections:\n  body:\n    type: flow\n    box: { x: 0, y: 0, w: 500, h: 700 }\n    items:\n      - type: image\n        id: logo\n        box: { w: 100, h: 100 }\n        data: { key: img }\n",
        )
        .expect("the fixed template parses")
    })
}

/// The injected byte map built from [`injected_files`].
fn injected() -> &'static BTreeMap<String, Vec<u8>> {
    static MAP: OnceLock<BTreeMap<String, Vec<u8>>> = OnceLock::new();
    MAP.get_or_init(|| {
        injected_files()
            .iter()
            .map(|(path, bytes, _)| ((*path).to_string(), bytes.to_vec()))
            .collect()
    })
}
