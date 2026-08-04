//! Loaded, validated image assets addressable by id.
//!
//! Mirrors `FontStore`: layout measures intrinsic sizes from here, the
//! PDF renderer draws bytes/vectors from here, and the layout tree only
//! carries asset ids — keeping `tree.rs` the sole layout↔renderer
//! contract.

use crate::raster::RasterFormat;
use crate::svg::SvgTree;
use std::collections::HashMap;
use std::sync::Arc;

/// Decoded content of one asset.
#[derive(Debug, Clone)]
pub enum AssetKind {
    /// A raster image. Encoded bytes are kept as-is: the PDF backend
    /// embeds and decodes them itself.
    Raster {
        /// Container format, from magic bytes.
        format: RasterFormat,
        /// Raw encoded bytes (shared with the renderer).
        bytes: Arc<Vec<u8>>,
        /// Pixel width from the header (> 0).
        width_px: u64,
        /// Pixel height from the header (> 0).
        height_px: u64,
    },
    /// A parsed SVG subset tree.
    Svg(SvgTree),
}

/// A loaded asset.
#[derive(Debug, Clone)]
pub struct Asset {
    /// Store key (`src:<src>` or `dyn:<params key>`).
    pub id: String,
    /// Decoded content.
    pub kind: AssetKind,
}

impl Asset {
    /// Intrinsic size in pt (raster px at 72 dpi; SVG viewBox units).
    /// Both dimensions are always positive — loading rejects zero sizes.
    pub fn intrinsic_size(&self) -> (f64, f64) {
        match &self.kind {
            AssetKind::Raster {
                width_px,
                height_px,
                ..
            } => (*width_px as f64, *height_px as f64),
            AssetKind::Svg(tree) => (tree.width, tree.height),
        }
    }

    /// Whether the asset can paint outside the rect the fit math reserved
    /// for it, so layout must clip it to the content box even when the
    /// fitted size does not overflow.
    ///
    /// A raster is exactly its pixel rect and never can. An SVG can: its
    /// intrinsic size is the `viewBox`, but nothing stops a path from
    /// lying outside it — and the `viewBox` IS the viewport, which clips
    /// (the outermost `<svg>` carries `overflow: hidden`). Without the
    /// clip, `contain`/`stretch` — the fits that "cannot overflow" — let
    /// an asset draw over the rest of the page, which for an untrusted
    /// asset is the whole point of the box.
    pub fn clips_to_viewport(&self) -> bool {
        matches!(self.kind, AssetKind::Svg(_))
    }
}

/// All assets one render needs, keyed by asset id.
#[derive(Debug, Default)]
pub struct AssetStore {
    assets: HashMap<String, Asset>,
}

impl AssetStore {
    /// An empty store (documents without images).
    pub fn empty() -> Self {
        Self::default()
    }

    /// Adds or replaces an asset.
    pub fn insert(&mut self, asset: Asset) {
        self.assets.insert(asset.id.clone(), asset);
    }

    /// Looks up an asset by id.
    pub fn get(&self, id: &str) -> Option<&Asset> {
        self.assets.get(id)
    }

    /// Whether an id is already loaded.
    pub fn contains(&self, id: &str) -> bool {
        self.assets.contains_key(id)
    }

    /// Number of loaded assets.
    pub fn len(&self) -> usize {
        self.assets.len()
    }

    /// True when no assets are loaded.
    pub fn is_empty(&self) -> bool {
        self.assets.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::svg::{parse_svg, SvgLimits};

    fn raster_asset(id: &str) -> Asset {
        Asset {
            id: id.to_string(),
            kind: AssetKind::Raster {
                format: RasterFormat::Png,
                bytes: Arc::new(vec![1, 2, 3]),
                width_px: 20,
                height_px: 10,
            },
        }
    }

    #[test]
    fn store_inserts_and_looks_up() {
        let mut store = AssetStore::empty();
        assert!(store.is_empty());
        assert_eq!(store.len(), 0);
        assert!(!store.contains("src:a.png"));

        store.insert(raster_asset("src:a.png"));
        assert!(store.contains("src:a.png"));
        assert_eq!(store.len(), 1);
        assert!(!store.is_empty());
        assert!(store.get("src:a.png").is_some());
        assert!(store.get("src:b.png").is_none());
    }

    #[test]
    fn intrinsic_size_covers_both_kinds() {
        assert_eq!(raster_asset("r").intrinsic_size(), (20.0, 10.0));

        let tree = parse_svg(r#"<svg viewBox="0 0 64 32"/>"#, &SvgLimits::default()).expect("svg");
        let svg = Asset {
            id: "s".to_string(),
            kind: AssetKind::Svg(tree),
        };
        assert_eq!(svg.intrinsic_size(), (64.0, 32.0));
    }

    #[test]
    fn only_svg_clips_to_its_viewport() {
        // A raster is exactly its pixel rect; an SVG's paths may sit
        // outside the viewBox, so layout must clip it whatever the fit.
        assert!(!raster_asset("r").clips_to_viewport());

        let tree = parse_svg(r#"<svg viewBox="0 0 10 10"/>"#, &SvgLimits::default()).expect("svg");
        let svg = Asset {
            id: "s".to_string(),
            kind: AssetKind::Svg(tree),
        };
        assert!(svg.clips_to_viewport());
    }
}
