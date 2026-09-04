//! Unit tests for the host-side image-source policy.

use super::*;

#[test]
fn open_mode_allows_inline_unless_denied() {
    let mut policy = AssetPolicy::default();
    assert!(policy.allows_inline_dynamic(Some("qr")));
    assert!(policy.allows_inline_dynamic(None));

    policy.dynamic_deny.push("stamp".to_string());
    assert!(!policy.allows_inline_dynamic(Some("stamp")));
    assert!(policy.is_denied(Some("stamp")));
    assert!(!policy.is_denied(Some("qr")));
    assert!(!policy.is_denied(None));
}

#[test]
fn bundled_only_requires_explicit_allow() {
    let mut policy = AssetPolicy {
        mode: AssetMode::BundledOnly,
        ..AssetPolicy::default()
    };
    assert!(!policy.allows_inline_dynamic(Some("qr")));
    assert!(!policy.allows_inline_dynamic(None));

    policy.dynamic_allow.push("qr".to_string());
    assert!(policy.allows_inline_dynamic(Some("qr")));
    assert!(!policy.allows_inline_dynamic(Some("other")));

    // Deny wins over allow.
    policy.dynamic_deny.push("qr".to_string());
    assert!(!policy.allows_inline_dynamic(Some("qr")));
}

#[test]
fn default_caps_are_sane() {
    let policy = AssetPolicy::default();
    assert_eq!(policy.mode, AssetMode::Open);
    assert!(policy.max_asset_bytes >= 1024 * 1024);
    assert!(policy.max_pixels >= 1_000_000);
    assert!(policy.svg_limits.max_nodes >= 1000);
}
