//! Host-side policy for which image sources are acceptable.
//!
//! The template already forms the first security layer: only items that
//! declare a `data` binding can receive params-supplied content at all.
//! This policy is the second, host-owned layer — it can shrink (never
//! grow) what the template allows, per item, plus resource caps applied
//! to every source.

use crate::svg::SvgLimits;

/// How dynamic (params-supplied) image content is treated.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum AssetMode {
    /// Params may carry inline content (data URIs / SVG text) unless an
    /// item is explicitly denied.
    #[default]
    Open,
    /// Params may only *select* bundled assets; inline content is
    /// rejected except for items explicitly allowed (e.g. QR codes).
    BundledOnly,
}

/// Source rules and resource caps enforced while loading assets.
#[derive(Debug, Clone)]
pub struct AssetPolicy {
    /// Dynamic-content mode.
    pub mode: AssetMode,
    /// Item ids that may receive inline dynamic content even under
    /// [`AssetMode::BundledOnly`].
    pub dynamic_allow: Vec<String>,
    /// Item ids that must never receive dynamic content, even under
    /// [`AssetMode::Open`].
    pub dynamic_deny: Vec<String>,
    /// Cap on encoded/decoded asset bytes.
    pub max_asset_bytes: usize,
    /// Cap on raster `width * height` in pixels.
    pub max_pixels: u64,
    /// Caps for the SVG subset parser.
    pub svg_limits: SvgLimits,
}

impl Default for AssetPolicy {
    fn default() -> Self {
        Self {
            mode: AssetMode::Open,
            dynamic_allow: Vec::new(),
            dynamic_deny: Vec::new(),
            max_asset_bytes: 8 * 1024 * 1024,
            max_pixels: 40_000_000,
            svg_limits: SvgLimits::default(),
        }
    }
}

impl AssetPolicy {
    /// Whether `item_id` is denied *any* dynamic content.
    pub fn is_denied(&self, item_id: Option<&str>) -> bool {
        item_id.is_some_and(|id| self.dynamic_deny.iter().any(|d| d == id))
    }

    /// Whether `item_id` may receive inline dynamic content (data URIs /
    /// SVG text from params). Bundled-asset *selection* via params is not
    /// gated here — it stays within compile-time content.
    pub fn allows_inline_dynamic(&self, item_id: Option<&str>) -> bool {
        if self.is_denied(item_id) {
            return false;
        }
        match self.mode {
            AssetMode::Open => true,
            AssetMode::BundledOnly => {
                item_id.is_some_and(|id| self.dynamic_allow.iter().any(|a| a == id))
            }
        }
    }
}

#[cfg(test)]
mod tests {
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
}
