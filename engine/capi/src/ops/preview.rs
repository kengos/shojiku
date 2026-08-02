//! `shojiku_preview`: the same document rasterized to PNG pages.
//!
//! `pageIndex` is 0-based, as in the WASM bindings (the CLI's `--page` is
//! 1-based because it names a page to a human). Asking for one page
//! rasterizes only that page, so a preview of page 40 does not pay for the
//! first 39; omitting it returns every page in document order.
//!
//! The range check happens here rather than in the rasterizer so an
//! out-of-range index is caller misuse with its own status code, not a render
//! error dressed up as a document problem.

use crate::ops::lay_out;
use crate::request::Request;
use crate::result::ShojikuResult;
use crate::status::{encode, Failure};
use shojiku_authoring::{preview_page, preview_pages};
use shojiku_render_png::RenderPngError;

/// The rasterizer's refusal, as a failure. A conversion rather than a
/// `map_err` closure per call site — the reasoning is in [`super::render`].
impl From<RenderPngError> for Failure {
    fn from(err: RenderPngError) -> Self {
        Failure::host("preview", "raster", &err)
    }
}

/// Rasterizes the document, or one page of it.
pub(crate) fn run(request: &Request) -> Result<ShojikuResult, Failure> {
    let laid = lay_out(request, "preview")?;
    let diagnostics = encode(&laid.prepared.diagnostics);
    let scale = request.scale();

    let pages = match request.page_index {
        Some(index) => {
            let total = laid.prepared.document.pages.len();
            if index >= total {
                return Err(Failure::OutOfRange { index, total });
            }
            vec![preview_page(&laid.prepared, &laid.fonts, scale, index)?]
        }
        None => preview_pages(&laid.prepared, &laid.fonts, scale)?,
    };
    Ok(ShojikuResult::pages(pages, diagnostics))
}

#[cfg(test)]
mod tests;
