//! The request envelope every document operation takes.
//!
//! One JSON object rather than a dozen C parameters, for two reasons: the ABI
//! stays frozen while the envelope grows a key, and an SDK builds a map
//! instead of threading optional strings through a signature. The sources
//! travel INSIDE it as text — this library never reads a template off disk,
//! so there is no path handling here to get wrong.
//!
//! `deny_unknown_fields` is the point of the schema: a misspelled key in an
//! SDK is a located error, not a silently ignored setting. `scale` and
//! `pageIndex` are read by `shojiku_preview` alone; the other operations
//! accept and ignore them, which is what keeps ONE envelope type across the
//! surface.
//!
//! Two caps here are host-level guards rather than engine behaviour, and both
//! mirror what the MCP host already does with the same inputs: the
//! allow/deny id lists are bounded because the policy rescans them per asset,
//! and `scale` is bounded because it multiplies into a raster allocation.

use crate::status::Failure;
use serde::Deserialize;
use shojiku_authoring::fs::{resolve_font_dirs, resolve_locale_dir};
use shojiku_image::{AssetMode, AssetPolicy};
use std::path::{Path, PathBuf};

/// Most item ids one allow/deny list may carry, as in the MCP host.
const MAX_ASSET_IDS: usize = 256;
/// Widest accepted preview scale, in output pixels per layout point. The CLI
/// default is 2.0 (≈144 dpi); this bounds the raster a caller can ask for.
const MAX_SCALE: f64 = 10.0;
/// Preview scale when the request does not say — the CLI's default.
const DEFAULT_SCALE: f64 = 2.0;

/// One operation's inputs.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Request {
    /// The template source.
    pub(crate) template: String,
    /// The definitions source, when the caller has one.
    #[serde(default)]
    pub(crate) definitions: Option<String>,
    /// The params source. Optional for `validate`, required to lay out.
    #[serde(default)]
    pub(crate) params: Option<String>,
    /// Locale id override, beating the template's own `defaults.locale`.
    #[serde(default)]
    pub(crate) lang: Option<String>,
    /// Extra font-pack search directories, highest priority first.
    #[serde(default)]
    font_dirs: Vec<PathBuf>,
    /// Extra locale-pack search directories, highest priority first.
    #[serde(default)]
    locale_dirs: Vec<PathBuf>,
    /// Directory bundled assets resolve against. Without it bundled sources
    /// are disabled — an inline template has no directory of its own.
    #[serde(default)]
    assets_dir: Option<PathBuf>,
    /// `"open"` (default) or `"bundled-only"`, the CLI's spellings.
    #[serde(default)]
    asset_mode: Option<String>,
    /// Item ids that may receive dynamic content under `bundled-only`.
    #[serde(default)]
    allow_dynamic_image: Vec<String>,
    /// Item ids that must never receive dynamic content.
    #[serde(default)]
    deny_dynamic_image: Vec<String>,
    /// Preview only: output pixels per layout point.
    #[serde(default)]
    scale: Option<f64>,
    /// Preview only: render just this 0-based page (the WASM host's
    /// convention, not the CLI's 1-based `--page`).
    #[serde(default)]
    pub(crate) page_index: Option<usize>,
}

impl Request {
    /// Reads the envelope. A malformed or unknown key comes back as an
    /// invalid-request failure carrying serde's own message, which names the
    /// offending field and where it was.
    pub(crate) fn parse(text: &str) -> Result<Request, Failure> {
        let request: Request =
            serde_json::from_str(text).map_err(|err| Failure::InvalidRequest(err.to_string()))?;
        request.check_asset_ids()?;
        request.check_scale()?;
        Ok(request)
    }

    /// The params source, which laying out cannot do without.
    pub(crate) fn require_params(&self) -> Result<&str, Failure> {
        self.params
            .as_deref()
            .ok_or_else(|| Failure::InvalidRequest("`params` is required to lay out".into()))
    }

    /// Font-pack search dirs: the request's, then `$SHOJIKU_FONT_DIR`, then
    /// the default — the same precedence the CLI gives its flags.
    pub(crate) fn font_dirs(&self) -> Vec<PathBuf> {
        resolve_font_dirs(&self.font_dirs)
    }

    /// Locale-pack search dirs, same precedence.
    pub(crate) fn locale_dirs(&self) -> Vec<PathBuf> {
        resolve_locale_dir(&self.locale_dirs)
    }

    /// The asset policy for this call; caps stay at the engine defaults.
    pub(crate) fn asset_policy(&self) -> Result<AssetPolicy, Failure> {
        Ok(AssetPolicy {
            mode: self.mode()?,
            dynamic_allow: self.allow_dynamic_image.clone(),
            dynamic_deny: self.deny_dynamic_image.clone(),
            ..AssetPolicy::default()
        })
    }

    /// The directory bundled assets resolve against, if any.
    pub(crate) fn assets_root(&self) -> Option<&Path> {
        self.assets_dir.as_deref()
    }

    /// The preview scale, defaulted.
    pub(crate) fn scale(&self) -> f64 {
        self.scale.unwrap_or(DEFAULT_SCALE)
    }

    /// `assetMode` in the CLI's spelling, so both hosts stay one surface.
    fn mode(&self) -> Result<AssetMode, Failure> {
        match self.asset_mode.as_deref() {
            None | Some("open") => Ok(AssetMode::Open),
            Some("bundled-only") => Ok(AssetMode::BundledOnly),
            // The refusal names the accepted values and never the rejected
            // one: it is caller-controlled text.
            Some(_) => Err(Failure::InvalidRequest(
                "`assetMode` must be \"open\" or \"bundled-only\"".into(),
            )),
        }
    }

    /// Bounds the allow/deny lists.
    fn check_asset_ids(&self) -> Result<(), Failure> {
        for (key, ids) in [
            ("allowDynamicImage", &self.allow_dynamic_image),
            ("denyDynamicImage", &self.deny_dynamic_image),
        ] {
            if ids.len() > MAX_ASSET_IDS {
                return Err(Failure::InvalidRequest(format!(
                    "`{key}` has {} entries, over the {MAX_ASSET_IDS}-entry cap",
                    ids.len()
                )));
            }
        }
        Ok(())
    }

    /// Bounds the preview scale. A non-finite scale would reach the
    /// rasterizer's own arithmetic, and a huge one is an allocation request
    /// wearing a float.
    fn check_scale(&self) -> Result<(), Failure> {
        let Some(scale) = self.scale else {
            return Ok(());
        };
        if scale.is_finite() && scale > 0.0 && scale <= MAX_SCALE {
            return Ok(());
        }
        Err(Failure::InvalidRequest(format!(
            "`scale` must be finite and within 0 < scale <= {MAX_SCALE}"
        )))
    }
}

#[cfg(test)]
mod tests;
