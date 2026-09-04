//! Unit tests for the loaded-asset store.

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
