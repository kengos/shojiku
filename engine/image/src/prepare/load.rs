//! Asset loading: static (template `src:`) and dynamic (params-bound)
//! sources, path confinement, and byte->asset classification.

use crate::error::ImageError;
use crate::policy::AssetPolicy;
use crate::raster::{checked_dimensions, sniff};
use crate::source::{classify, decode_data_uri, DataUriPayload, ImageSource};
use crate::store::AssetKind;
use crate::svg::parse_svg;
use serde_json::Value;
use shojiku_core::resolve_path;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};
use std::sync::Arc;

use super::bundled::{load_bytes, AssetsRoot};
use super::Origin;

pub(super) fn static_asset(
    src: &str,
    policy: &AssetPolicy,
    root: AssetsRoot<'_>,
    path: &str,
    diags: &mut Diagnostics,
) -> Option<AssetKind> {
    match classify(src) {
        ImageSource::Remote(url) => {
            remote_rejected(&url, path, diags);
            None
        }
        ImageSource::DataUri(uri) => inline_kind(
            &InlineContent::DataUri(uri),
            policy,
            Origin::Static,
            path,
            diags,
        ),
        ImageSource::SvgText(text) => inline_kind(
            &InlineContent::SvgText(text),
            policy,
            Origin::Static,
            path,
            diags,
        ),
        ImageSource::Bundled(rel) => bundled_kind(&rel, policy, root, Origin::Static, path, diags),
    }
}

/// Resolves a params-bound image value under the policy.
pub(super) fn dynamic_asset(
    item_id: Option<&str>,
    key: &str,
    params: &Value,
    policy: &AssetPolicy,
    root: AssetsRoot<'_>,
    path: &str,
    diags: &mut Diagnostics,
) -> Option<AssetKind> {
    if policy.is_denied(item_id) {
        diags.push(
            Diagnostic::new(Code::DynamicImageDenied)
                .arg("scope", " for this item")
                .with_path(path.to_string()),
        );
        return None;
    }
    let Some(value) = resolve_path(params, key) else {
        diags.push(
            Diagnostic::new(Code::MissingData)
                .arg("scope", "")
                .arg("key", key)
                .with_path(path.to_string()),
        );
        return None;
    };
    let Some(raw) = value.as_str() else {
        diags.push(
            Diagnostic::new(Code::InvalidImageData)
                .arg("detail", format!("params value at `{key}` is not a string"))
                .with_path(path.to_string()),
        );
        return None;
    };
    dynamic_value(item_id, raw, policy, root, path, diags)
}

/// Classifies and loads one params-supplied image string (the tail of
/// [`dynamic_asset`], shared with per-element table-cell assets — the
/// caller has already resolved the value and checked the deny list).
pub(super) fn dynamic_value(
    item_id: Option<&str>,
    raw: &str,
    policy: &AssetPolicy,
    root: AssetsRoot<'_>,
    path: &str,
    diags: &mut Diagnostics,
) -> Option<AssetKind> {
    match classify(raw) {
        ImageSource::Remote(url) => {
            remote_rejected(&url, path, diags);
            None
        }
        // Selecting a bundled asset stays within compile-time content, so
        // it is allowed even under BundledOnly (unless the item is denied,
        // checked above).
        ImageSource::Bundled(rel) => bundled_kind(&rel, policy, root, Origin::Dynamic, path, diags),
        ImageSource::DataUri(_) | ImageSource::SvgText(_)
            if !policy.allows_inline_dynamic(item_id) =>
        {
            diags.push(
                Diagnostic::new(Code::DynamicImageDenied)
                    .arg("scope", " for this item")
                    .with_path(path.to_string()),
            );
            None
        }
        ImageSource::DataUri(uri) => inline_kind(
            &InlineContent::DataUri(uri),
            policy,
            Origin::Dynamic,
            path,
            diags,
        ),
        ImageSource::SvgText(text) => inline_kind(
            &InlineContent::SvgText(text),
            policy,
            Origin::Dynamic,
            path,
            diags,
        ),
    }
}

fn remote_rejected(url: &str, path: &str, diags: &mut Diagnostics) {
    diags.push(
        Diagnostic::new(Code::RemoteAssetUnsupported)
            .arg("url", url)
            .with_path(path.to_string()),
    );
}

/// Inline content carried in the source string itself.
enum InlineContent {
    DataUri(String),
    SvgText(String),
}

fn inline_kind(
    content: &InlineContent,
    policy: &AssetPolicy,
    origin: Origin,
    path: &str,
    diags: &mut Diagnostics,
) -> Option<AssetKind> {
    let result = match content {
        InlineContent::DataUri(uri) => {
            decode_data_uri(uri, policy.max_asset_bytes).and_then(|payload| match payload {
                DataUriPayload::Bytes(bytes) => kind_from_bytes(bytes, policy),
                DataUriPayload::Svg(text) => svg_kind(&text, policy),
            })
        }
        InlineContent::SvgText(text) => {
            if text.len() > policy.max_asset_bytes {
                Err(ImageError::TooLarge {
                    len: text.len(),
                    cap: policy.max_asset_bytes,
                })
            } else {
                svg_kind(text, policy)
            }
        }
    };
    match result {
        Ok(kind) => Some(kind),
        Err(err) => {
            diags.push(origin.content_problem(format!("inline image: {err}"), path));
            None
        }
    }
}

fn bundled_kind(
    rel: &str,
    policy: &AssetPolicy,
    root: AssetsRoot<'_>,
    origin: Origin,
    path: &str,
    diags: &mut Diagnostics,
) -> Option<AssetKind> {
    // No configured root is distinct from a load failure — an author with
    // no assets directory gets the actionable `assets_root_missing`.
    if matches!(root, AssetsRoot::None) {
        diags.push(
            Diagnostic::new(Code::AssetsRootMissing)
                .arg("path", rel)
                .with_path(path.to_string()),
        );
        return None;
    }
    match load_bytes(&root, rel, policy).and_then(|bytes| kind_from_bytes(bytes, policy)) {
        Ok(kind) => Some(kind),
        // Escaping the assets root is a security violation regardless of
        // who supplied the path.
        Err(ImageError::Traversal(p)) => {
            diags.push(
                Diagnostic::new(Code::AssetTraversal)
                    .arg("path", p)
                    .with_path(path.to_string()),
            );
            None
        }
        Err(err) => {
            diags.push(origin.content_problem(format!("asset `{rel}`: {err}"), path));
            None
        }
    }
}

/// Builds an asset from raw bytes: raster by magic bytes, else SVG if it
/// looks like markup. The caller has already enforced the byte cap.
fn kind_from_bytes(bytes: Vec<u8>, policy: &AssetPolicy) -> Result<AssetKind, ImageError> {
    if let Some(format) = sniff(&bytes) {
        let (width_px, height_px) = checked_dimensions(&bytes, policy.max_pixels)?;
        return Ok(AssetKind::Raster {
            format,
            bytes: Arc::new(bytes),
            width_px,
            height_px,
        });
    }
    if bytes.iter().find(|b| !b.is_ascii_whitespace()) == Some(&b'<') {
        let text = String::from_utf8(bytes)
            .map_err(|_| ImageError::Bad("markup is not valid UTF-8".to_string()))?;
        return svg_kind(&text, policy);
    }
    Err(ImageError::Bad("unrecognized image format".to_string()))
}

fn svg_kind(text: &str, policy: &AssetPolicy) -> Result<AssetKind, ImageError> {
    Ok(AssetKind::Svg(parse_svg(text, &policy.svg_limits)?))
}
