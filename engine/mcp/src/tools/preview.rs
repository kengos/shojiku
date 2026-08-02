//! The `render_preview` tool: lay out, rasterize, and answer one PNG image
//! part per selected page followed by the diagnostics JSON — never an
//! image alone. Page selection is capped so a hostile/paginating document
//! cannot balloon the response.

use super::pipeline::{prepare_from, tool_msg, CallArgs, ToolFailure};
use super::{failure_result, image_part, json_text, text_part, tool_result, ToolOutcome};
use crate::rpc::INVALID_PARAMS;
use crate::ServerArgs;
use serde_json::Value;
use shojiku_authoring::{preview_page, preview_pages};

/// Most pages returned in one response without an explicit `page`.
pub(crate) const MAX_PREVIEW_PAGES: usize = 20;

/// Default raster scale (pixels per layout point), matching the CLI.
pub(crate) const DEFAULT_SCALE: f64 = 2.0;

/// Runs `render_preview` over the path + selection arguments.
pub(crate) fn run(server: &ServerArgs, arguments: &Value) -> ToolOutcome {
    let call = CallArgs::parse(arguments)?;
    let scale = parse_scale(arguments)?;
    let page = parse_page(arguments)?;
    Ok(match run_inner(server, &call, scale, page) {
        Ok(result) => result,
        Err(failure) => failure_result(failure),
    })
}

/// The pipeline: prepare → validate the selection → rasterize only what was
/// asked → assemble content parts. The page count comes from the laid-out
/// document, so the cap/range check runs BEFORE rasterizing (a single `page`
/// renders one page instead of all-then-select).
fn run_inner(
    server: &ServerArgs,
    call: &CallArgs,
    scale: f64,
    page: Option<usize>,
) -> Result<Value, ToolFailure> {
    let doc = prepare_from(server, call)?;
    let total = doc.prepared.document.pages.len();
    // Validate up front (cap when no page, range when a page is given) with the
    // pinned messages, before any rasterization; the returned 0-based indices
    // drive the render so nothing recomputes them.
    let indices = select_pages(total, page).map_err(ToolFailure::Message)?;
    let images = match indices.as_slice() {
        // An explicitly selected page: rasterize only it.
        [only] if page.is_some() => {
            vec![preview_page(&doc.prepared, &doc.fonts, scale, *only).map_err(tool_msg)?]
        }
        // Every page: the all-pages primitive shares one glyph cache across pages.
        _ => preview_pages(&doc.prepared, &doc.fonts, scale).map_err(tool_msg)?,
    };
    let mut content: Vec<Value> = images.iter().map(|p| image_part(p)).collect();
    content.push(text_part(json_text(&doc.prepared.diagnostics)));
    Ok(tool_result(content, false))
}

/// Pure page selection: a 1-based `page` picks one; absent means every
/// page, refused past [`MAX_PREVIEW_PAGES`] so the caller narrows instead.
pub(crate) fn select_pages(total: usize, page: Option<usize>) -> Result<Vec<usize>, String> {
    match page {
        Some(page) => {
            let index = page
                .checked_sub(1)
                .filter(|i| *i < total)
                .ok_or_else(|| format!("page {page} is out of range (document has {total} pages)"))?;
            Ok(vec![index])
        }
        None if total > MAX_PREVIEW_PAGES => Err(format!(
            "document has {total} pages (over the {MAX_PREVIEW_PAGES}-page response cap); pass `page` to select one"
        )),
        None => Ok((0..total).collect()),
    }
}

/// `scale`: an optional JSON number (value sanity — canvas caps, positive
/// size — is enforced by the render stage and surfaces in-band).
fn parse_scale(arguments: &Value) -> Result<f64, (i64, String)> {
    match arguments.get("scale") {
        None | Some(Value::Null) => Ok(DEFAULT_SCALE),
        Some(value) => value
            .as_f64()
            .ok_or_else(|| (INVALID_PARAMS, "`scale` must be a number".into())),
    }
}

/// `page`: an optional integer ≥ 1.
fn parse_page(arguments: &Value) -> Result<Option<usize>, (i64, String)> {
    match arguments.get("page") {
        None | Some(Value::Null) => Ok(None),
        Some(value) => match value.as_u64().and_then(|p| usize::try_from(p).ok()) {
            Some(page) if page >= 1 => Ok(Some(page)),
            _ => Err((INVALID_PARAMS, "`page` must be an integer >= 1".into())),
        },
    }
}

#[cfg(test)]
mod tests;
