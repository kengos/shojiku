//! The operations, and the layout pipeline three of them share.
//!
//! Each submodule is safe Rust over borrowed strings and slices — by the time
//! anything here runs, the raw pointers are gone. That split is the whole
//! reason `unsafe` in this crate stays inside `input`, `result` and the entry
//! points: the code that can actually get a document wrong never touches a
//! pointer.
//!
//! [`lay_out`] is the CLI's `prepare_layout` without the filesystem reads and
//! without the font fetch: sources arrive as text, and every face has to be
//! installed already. A pack that is missing is a structured failure, never a
//! download — the render path this library exposes is socket-free.

pub(crate) mod info;
pub(crate) mod preview;
pub(crate) mod render;
pub(crate) mod sign;
pub(crate) mod validate;
pub(crate) mod verify;

use crate::request::Request;
use crate::status::Failure;
use shojiku_authoring::fs::load_locale_pack;
use shojiku_authoring::{
    load_sources, prepare, resolve_locale_id, AssetsInput, PrepareCtx, Prepared,
};
use shojiku_formatter::{resolve_face_specs, LangPack};
use shojiku_layout::FontStore;

/// A laid-out document and the font store the render stage still needs — the
/// store has to outlive layout, so it travels with the document rather than
/// being rebuilt.
pub(crate) struct Laid {
    pub(crate) prepared: Prepared,
    pub(crate) fonts: FontStore,
}

/// Parses the sources, resolves the locale and fonts, and lays the document
/// out. `step` names the operation for the failure's trace.
pub(crate) fn lay_out(request: &Request, step: &'static str) -> Result<Laid, Failure> {
    let params = request.require_params()?;
    let sources = load_sources(request.definitions.as_deref(), &request.template, params)
        .map_err(|err| Failure::host(step, "parse", &err))?;
    // Gate the document's own errors before touching packs, so a broken
    // template reports itself even where no packs are installed — the CLI
    // orders it the same way, and `prepare` gates again harmlessly.
    if sources.validation.has_errors() {
        return Err(Failure::document(step, &sources.validation));
    }

    let locale = resolve_locale_id(
        request.lang.as_deref(),
        sources.template.defaults.locale.as_deref(),
    );
    let pack = load_locale_pack(&locale, &request.locale_dirs())
        .map_err(|err| Failure::host(step, "locale_pack", &err))?;
    let fonts = load_fonts(&pack, request, step)?;
    let policy = request.asset_policy()?;

    let prepared = prepare(
        sources,
        PrepareCtx {
            pack: &pack,
            fonts: &fonts,
            assets: AssetsInput::Prepare {
                policy: &policy,
                root: request.assets_root(),
            },
        },
    )
    .map_err(|diagnostics| Failure::document(step, &diagnostics))?;
    Ok(Laid { prepared, fonts })
}

/// Loads the locale's font packs from the filesystem.
///
/// No fetch layer: a face that is pinned but absent fails here with the
/// engine's own message rather than being downloaded, which is what keeps
/// this library free of a network surface entirely.
fn load_fonts(
    pack: &LangPack,
    request: &Request,
    step: &'static str,
) -> Result<FontStore, Failure> {
    let specs = resolve_face_specs(pack, &request.font_dirs())
        .map_err(|err| Failure::host(step, "font_pack", &err))?;
    FontStore::load_from_specs(specs, pack).map_err(|err| Failure::host(step, "font", &err))
}
