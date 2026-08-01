//! Preview rasterization: every page to PNG bytes (the export/download form)
//! or raw RGBA pixels (the canvas form, skipping the PNG encode). Page
//! selection and output naming stay in the caller (CLI); both return one
//! entry per page in order.

use crate::prepare::Prepared;
use shojiku_layout::FontStore;
use shojiku_render_png::{
    render_png, render_png_page, render_raw, render_raw_page, PngOptions, RawPage, RenderPngError,
};

/// Rasterizes every page of a prepared document to PNG bytes at `scale`
/// px/pt. `fonts` is the same store passed to [`prepare`](crate::prepare).
pub fn preview_pages(
    prepared: &Prepared,
    fonts: &FontStore,
    scale: f64,
) -> Result<Vec<Vec<u8>>, RenderPngError> {
    render_png(
        &prepared.document,
        fonts,
        &prepared.assets,
        &PngOptions { scale },
    )
}

/// Rasterizes every page to raw un-premultiplied RGBA pixels at `scale`
/// px/pt — the encode-free form a WASM host paints straight to a canvas via
/// `ImageData`, skipping the PNG encode that dominates [`preview_pages`].
pub fn preview_raw(
    prepared: &Prepared,
    fonts: &FontStore,
    scale: f64,
) -> Result<Vec<RawPage>, RenderPngError> {
    render_raw(
        &prepared.document,
        fonts,
        &prepared.assets,
        &PngOptions { scale },
    )
}

/// Rasterizes ONE page (0-based `page`) of a prepared document to PNG bytes.
/// A host renders only the page it needs instead of every page; out of range
/// surfaces as [`RenderPngError::PageOutOfRange`]. The bytes are identical to
/// that page of [`preview_pages`].
pub fn preview_page(
    prepared: &Prepared,
    fonts: &FontStore,
    scale: f64,
    page: usize,
) -> Result<Vec<u8>, RenderPngError> {
    render_png_page(
        &prepared.document,
        fonts,
        &prepared.assets,
        &PngOptions { scale },
        page,
    )
}

/// Rasterizes ONE page (0-based `page`) to raw un-premultiplied RGBA pixels —
/// the single-page mirror of [`preview_raw`], the form that keeps a large
/// document from accumulating every uncompressed page in a host's heap.
pub fn preview_page_raw(
    prepared: &Prepared,
    fonts: &FontStore,
    scale: f64,
    page: usize,
) -> Result<RawPage, RenderPngError> {
    render_raw_page(
        &prepared.document,
        fonts,
        &prepared.assets,
        &PngOptions { scale },
        page,
    )
}

#[cfg(test)]
mod tests;
