//! Confinement + byte-cap parity between the filesystem and injected roots.

use super::*;
use crate::raster::test_support::tiny_png;

fn injected(entries: &[(&str, Vec<u8>)]) -> BTreeMap<String, Vec<u8>> {
    entries
        .iter()
        .map(|(k, v)| (k.to_string(), v.clone()))
        .collect()
}

#[test]
fn confined_key_drops_curdir_and_joins_normals() {
    assert_eq!(confined_key("./a/b.png").unwrap(), "a/b.png");
    assert_eq!(confined_key("a/b.png").unwrap(), "a/b.png");
}

#[test]
fn confined_key_rejects_parent_and_absolute() {
    assert!(matches!(
        confined_key("../secret"),
        Err(ImageError::Traversal(_))
    ));
    assert!(matches!(
        confined_key("/etc/passwd"),
        Err(ImageError::Traversal(_))
    ));
}

#[test]
fn injected_root_loads_a_matching_key() {
    let map = injected(&[("logo.png", tiny_png(6, 3))]);
    let root = AssetsRoot::Injected(&map);
    let bytes = load_bytes(&root, "./logo.png", &AssetPolicy::default()).unwrap();
    assert_eq!(bytes, tiny_png(6, 3));
}

#[test]
fn injected_root_reports_a_missing_key() {
    let map = injected(&[("logo.png", tiny_png(6, 3))]);
    let root = AssetsRoot::Injected(&map);
    assert!(matches!(
        load_bytes(&root, "other.png", &AssetPolicy::default()),
        Err(ImageError::Missing(_))
    ));
}

#[test]
fn injected_root_rejects_a_traversal_key() {
    let map = injected(&[("logo.png", tiny_png(6, 3))]);
    let root = AssetsRoot::Injected(&map);
    assert!(matches!(
        load_bytes(&root, "../logo.png", &AssetPolicy::default()),
        Err(ImageError::Traversal(_))
    ));
}

#[test]
fn injected_root_enforces_the_byte_cap() {
    let map = injected(&[("logo.png", vec![0u8; 100])]);
    let root = AssetsRoot::Injected(&map);
    let policy = AssetPolicy {
        max_asset_bytes: 10,
        ..AssetPolicy::default()
    };
    assert!(matches!(
        load_bytes(&root, "logo.png", &policy),
        Err(ImageError::TooLarge { .. })
    ));
}

#[test]
fn none_root_reports_missing() {
    assert!(matches!(
        load_bytes(&AssetsRoot::None, "logo.png", &AssetPolicy::default()),
        Err(ImageError::Missing(_))
    ));
}
