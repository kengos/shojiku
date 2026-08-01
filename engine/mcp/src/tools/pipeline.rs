//! Shared source→layout pipeline for the template tools: argument
//! composition (sources in `sources.rs`, asset knobs in `assets.rs`),
//! pack/font resolution, and the authoring `prepare` gate. Gate order
//! mirrors the CLI: a broken template reports its own diagnostics BEFORE
//! any pack/font environment error can mask them.

use super::assets::AssetArgs;
use super::sources::{opt_source, req_source, Source};
use crate::rpc::INVALID_PARAMS;
use crate::ServerArgs;
use serde_json::Value;
use shojiku_authoring::fs::{load_locale_pack, resolve_font_dirs, resolve_locale_dir};
use shojiku_authoring::{
    load_sources, prepare, resolve_locale_id, AssetsInput, PrepareCtx, Prepared,
};
use shojiku_diagnostics::Diagnostics;
use shojiku_layout::FontStore;

/// In-band tool failure, answered with `isError: true`: a plain message,
/// or the full diagnostics list.
pub(crate) enum ToolFailure {
    Message(String),
    Diagnostics(Diagnostics),
}

/// Formats any error as an in-band message failure.
pub(crate) fn tool_msg<E: std::fmt::Display>(err: E) -> ToolFailure {
    ToolFailure::Message(err.to_string())
}

/// The arguments shared by `render_preview` and `inspect_layout`. Each
/// source is a path or inline text; the asset knobs mirror the CLI's.
pub(crate) struct CallArgs {
    pub definitions: Option<Source>,
    pub template: Source,
    pub params: Source,
    pub lang: Option<String>,
    pub assets: AssetArgs,
}

impl CallArgs {
    /// Parses the shared arguments; a missing or wrong-typed key is a
    /// protocol-level invalid-params error.
    pub(crate) fn parse(arguments: &Value) -> Result<Self, (i64, String)> {
        Ok(CallArgs {
            definitions: opt_source(arguments, "definitions")?,
            template: req_source(arguments, "template")?,
            params: req_source(arguments, "params")?,
            lang: opt_string(arguments, "lang")?,
            assets: AssetArgs::parse(arguments)?,
        })
    }
}

/// An optional string argument; present-but-not-a-string is an error.
pub(crate) fn opt_string(arguments: &Value, key: &str) -> Result<Option<String>, (i64, String)> {
    match arguments.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s.clone())),
        Some(_) => Err((INVALID_PARAMS, format!("`{key}` must be a string"))),
    }
}

/// A laid-out document plus the font store the render stage borrows.
pub(crate) struct PreparedDoc {
    pub prepared: Prepared,
    pub fonts: FontStore,
}

/// Reads the sources, resolves locale + fonts from the configured search
/// dirs, and runs the authoring pipeline.
pub(crate) fn prepare_from(
    server: &ServerArgs,
    call: &CallArgs,
) -> Result<PreparedDoc, ToolFailure> {
    let defs = match &call.definitions {
        Some(source) => Some(source.read()?),
        None => None,
    };
    let template = call.template.read()?;
    let params = call.params.read()?;
    let sources = load_sources(defs.as_deref(), &template, &params)
        .map_err(|err| ToolFailure::Diagnostics(one_diag(&err)))?;
    // Gate validation errors before touching locale/font packs: a broken
    // template must report its own errors even with no packs installed.
    if sources.validation.has_errors() {
        return Err(ToolFailure::Diagnostics(sources.validation));
    }
    let locale = resolve_locale_id(
        call.lang.as_deref(),
        sources.template.defaults.locale.as_deref(),
    );
    let pack =
        load_locale_pack(&locale, &resolve_locale_dir(&server.locale_dir)).map_err(tool_msg)?;
    let fonts =
        FontStore::load_from_pack(&pack, &resolve_font_dirs(&server.font_dir)).map_err(tool_msg)?;
    let policy = call.assets.policy();
    let root = call.assets.root(&call.template);
    let prepared = prepare(
        sources,
        PrepareCtx {
            pack: &pack,
            fonts: &fonts,
            assets: AssetsInput::Prepare {
                policy: &policy,
                root: root.as_deref(),
            },
        },
    )
    .map_err(ToolFailure::Diagnostics)?;
    Ok(PreparedDoc { prepared, fonts })
}

/// Wraps a source parse failure as a one-item diagnostics list.
fn one_diag(err: &shojiku_core::CoreError) -> Diagnostics {
    let mut diags = Diagnostics::new();
    diags.push(err.to_diagnostic());
    diags
}

#[cfg(test)]
mod tests;
