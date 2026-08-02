//! Per-call asset arguments, mirroring the CLI's `--assets-dir` /
//! `--asset-mode` / `--allow|deny-dynamic-image`: which directory bundled
//! images resolve against, and how much params-supplied (dynamic) content an
//! item may carry. The engine-side policy type is `shojiku_image`'s — this
//! module only parses the wire form and builds it.

use super::pipeline::opt_string;
use super::sources::Source;
use crate::rpc::INVALID_PARAMS;
use serde_json::Value;
use shojiku_image::{AssetMode, AssetPolicy};
use std::path::PathBuf;

/// Most item ids one allow/deny list may carry. The policy scans the list
/// once per asset, so an unbounded list turns a many-image template into a
/// quadratic walk driven entirely by the client.
pub(crate) const MAX_ASSET_IDS: usize = 256;

/// The parsed asset arguments of one call.
pub(crate) struct AssetArgs {
    dir: Option<PathBuf>,
    mode: AssetMode,
    allow: Vec<String>,
    deny: Vec<String>,
}

impl AssetArgs {
    /// Parses the asset arguments; every one of them is optional and
    /// defaults to the CLI's default (open mode, no lists, template dir).
    pub(crate) fn parse(arguments: &Value) -> Result<Self, (i64, String)> {
        Ok(AssetArgs {
            dir: opt_string(arguments, "assetsDir")?.map(PathBuf::from),
            mode: parse_mode(arguments)?,
            allow: id_list(arguments, "allowDynamicImage")?,
            deny: id_list(arguments, "denyDynamicImage")?,
        })
    }

    /// The policy for this call (caps stay at the engine defaults).
    pub(crate) fn policy(&self) -> AssetPolicy {
        AssetPolicy {
            mode: self.mode,
            dynamic_allow: self.allow.clone(),
            dynamic_deny: self.deny.clone(),
            ..AssetPolicy::default()
        }
    }

    /// The directory bundled assets resolve against: `assetsDir` > the
    /// template file's own directory > none. An inline template has no
    /// directory, so without `assetsDir` bundled sources are disabled and a
    /// `src:` answers the actionable `assets_root_missing` diagnostic.
    pub(crate) fn root(&self, template: &Source) -> Option<PathBuf> {
        match &self.dir {
            Some(dir) => Some(dir.clone()),
            None => template.dir(),
        }
    }
}

/// `assetMode`: the CLI's value spelling, so MCP and CLI stay one surface.
fn parse_mode(arguments: &Value) -> Result<AssetMode, (i64, String)> {
    match opt_string(arguments, "assetMode")?.as_deref() {
        None | Some("open") => Ok(AssetMode::Open),
        Some("bundled-only") => Ok(AssetMode::BundledOnly),
        Some(_) => Err((
            INVALID_PARAMS,
            "`assetMode` must be \"open\" or \"bundled-only\"".into(),
        )),
    }
}

/// An optional array of item ids, bounded by [`MAX_ASSET_IDS`].
fn id_list(arguments: &Value, key: &str) -> Result<Vec<String>, (i64, String)> {
    let items = match arguments.get(key) {
        None | Some(Value::Null) => return Ok(Vec::new()),
        Some(Value::Array(items)) => items,
        Some(_) => return Err(not_id_array(key)),
    };
    if items.len() > MAX_ASSET_IDS {
        return Err((
            INVALID_PARAMS,
            format!(
                "`{key}` has {} entries, over the {MAX_ASSET_IDS}-entry cap",
                items.len()
            ),
        ));
    }
    items
        .iter()
        .map(|item| match item {
            Value::String(id) => Ok(id.clone()),
            _ => Err(not_id_array(key)),
        })
        .collect()
}

/// The shared wrong-shape refusal (never echoes the offending value).
fn not_id_array(key: &str) -> (i64, String) {
    (
        INVALID_PARAMS,
        format!("`{key}` must be an array of item id strings"),
    )
}

#[cfg(test)]
mod tests;
