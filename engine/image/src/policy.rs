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
mod tests;
