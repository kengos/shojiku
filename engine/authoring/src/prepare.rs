//! The layout pipeline shared by `inspect` / `preview` / `render`: gate
//! validation errors, load (or accept injected) assets, lay out, dedupe
//! diagnostics. On any errors the full diagnostics list is returned so the
//! caller can print (CLI) or serialize (WASM/MCP) it; on success the
//! surviving warnings ride along in [`Prepared`].

use crate::sources::Sources;
use shojiku_diagnostics::Diagnostics;
use shojiku_formatter::LangPack;
use shojiku_image::{prepare_assets, prepare_assets_injected, AssetPolicy, AssetStore};
use shojiku_layout::{layout, BoxIndex, FontStore, LayoutDocument, LayoutInput};
use std::collections::BTreeMap;
use std::path::Path;

/// Where the asset store comes from: walked from the template against a
/// filesystem directory (the CLI / MCP hosts), walked against host-injected
/// bytes (the WASM host), or pre-built by the host.
pub enum AssetsInput<'a> {
    /// Walk the template and load bundled/dynamic assets from a filesystem
    /// directory. `root` is the directory bundled assets resolve against;
    /// `None` disables bundled sources.
    Prepare {
        policy: &'a AssetPolicy,
        root: Option<&'a Path>,
    },
    /// Walk the template and load bundled/dynamic assets from host-injected
    /// bytes (no filesystem — the WASM host). `assets` is keyed by the same
    /// relative path the template references; the same walk, keys, caps, and
    /// confinement as [`Prepare`](AssetsInput::Prepare) apply.
    PrepareInjected {
        policy: &'a AssetPolicy,
        assets: &'a BTreeMap<String, Vec<u8>>,
    },
    /// The host injected the bytes and built the store already.
    Prebuilt(AssetStore),
}

/// The resolved non-source inputs to [`prepare`]. `pack` and `fonts` are
/// built by the caller (CLI from the filesystem, a host from injected bytes)
/// and borrowed here; `fonts` is also needed by the caller for rendering.
pub struct PrepareCtx<'a> {
    pub pack: &'a LangPack,
    pub fonts: &'a FontStore,
    pub assets: AssetsInput<'a>,
}

/// A laid-out document plus everything the render/preview/inspect stages
/// need. `assets` is returned (built here on the `Prepare` path) so the
/// caller can render without rebuilding it; `diagnostics` are the surviving
/// warnings.
#[derive(Debug)]
pub struct Prepared {
    pub document: LayoutDocument,
    pub boxes: BoxIndex,
    /// Resolved page margins `[top, right, bottom, left]` in pt.
    pub margin: [f64; 4],
    pub diagnostics: Diagnostics,
    pub title: String,
    pub assets: AssetStore,
}

/// Runs the pipeline. `sources` is consumed (its template/params move into
/// the layout and its validation diagnostics into the output list).
///
/// Callers that acquire packs/fonts expensively (filesystem walks, network
/// fetches on the host side) should check `sources.validation.has_errors()`
/// BEFORE acquiring them, so a broken template reports its own errors ahead
/// of environment errors — the CLI does; the gate here re-runs harmlessly.
pub fn prepare(sources: Sources, ctx: PrepareCtx) -> Result<Prepared, Diagnostics> {
    let mut all = sources.validation;
    if all.has_errors() {
        return Err(all);
    }

    let (assets, asset_diags) = match ctx.assets {
        AssetsInput::Prepare { policy, root } => {
            prepare_assets(&sources.template, &sources.params, policy, root)
        }
        AssetsInput::PrepareInjected { policy, assets } => {
            prepare_assets_injected(&sources.template, &sources.params, policy, assets)
        }
        AssetsInput::Prebuilt(store) => (store, Diagnostics::new()),
    };
    all.extend(asset_diags);
    if all.has_errors() {
        return Err(all);
    }

    let out = layout(&LayoutInput {
        template: &sources.template,
        params: &sources.params,
        catalog: sources.catalog.as_ref(),
        pack: ctx.pack,
        fonts: ctx.fonts,
        assets: Some(&assets),
    });
    all.extend(out.diagnostics);
    // Validation and layout can each surface the same `(code, path)` for one
    // item (e.g. `missing_data` seen statically and again at render).
    all.dedup();
    if all.has_errors() {
        return Err(all);
    }

    let title = sources
        .template
        .name
        .clone()
        .unwrap_or_else(|| "Shojiku Document".to_string());
    Ok(Prepared {
        document: out.document,
        boxes: out.boxes,
        margin: out.margin,
        diagnostics: all,
        title,
        assets,
    })
}

#[cfg(test)]
mod tests;
