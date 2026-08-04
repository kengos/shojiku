//! `shojiku_render`: a template and its params in, PDF bytes out.
//!
//! The PDF backend is composed HERE, in the host, exactly as the CLI and the
//! WASM bindings compose it — `shojiku-authoring` stays PDF-free — so the
//! bytes an SDK writes are the bytes `shojiku render` writes.

use crate::ops::{lay_out, Laid};
use crate::request::Request;
use crate::result::ShojikuResult;
use crate::status::{encode, Failure};
use serde_json::json;
use shojiku_render_pdf::{render_pdf, RenderError};

/// The backend's refusal, as a failure.
///
/// A conversion rather than a `map_err` closure at the call site: the backend
/// only refuses a page-less layout, which the layout engine does not produce,
/// so a closure there would be a line no test could reach. One conversion is
/// one line, and its own test reaches it.
impl From<RenderError> for Failure {
    fn from(err: RenderError) -> Self {
        Failure::host("render", "pdf", &err)
    }
}

/// Renders to PDF. Surviving warnings ride on the successful result.
///
/// The page count travels as the result's JSON payload. `docs/agents/sdk.md`
/// makes it artifact metadata every SDK exposes, and the existing page-count
/// accessor cannot carry it: that one counts the PNG buffers a PREVIEW
/// produced, and redefining it would move the ABI revision instead of
/// appending to it.
pub(crate) fn run(request: &Request) -> Result<ShojikuResult, Failure> {
    let laid = lay_out(request, "render")?;
    let pages = laid.prepared.document.pages.len();
    let pdf = draw(&laid)?;
    let result = ShojikuResult::pdf(pdf, encode(&laid.prepared.diagnostics));
    Ok(result.with_json(encode(&json!({ "pageCount": pages }))))
}

/// Hands the laid-out document to the PDF backend.
///
/// Its own function so the call fits one physical line: a wrapped call whose
/// `)?` lands on a line by itself leaves that line with no region any run
/// executes, and the coverage gate reads it as dead code.
fn draw(laid: &Laid) -> Result<Vec<u8>, RenderError> {
    let Laid { prepared, fonts } = laid;
    render_pdf(&prepared.document, fonts, &prepared.assets)
}

#[cfg(test)]
mod tests;
