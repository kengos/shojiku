//! PNG preview rendering: rasterizes a [`LayoutDocument`] with tiny-skia.
//!
//! This is the `Preview` stage of the pipeline and the image half of the
//! AI/MCP three-part bundle (Preview PNG + Layout Tree + Diagnostics).
//! Like the PDF backend it only draws — every position and format was
//! decided by layout, and glyph outlines / raster pixels come from the
//! shared `FontStore` / `AssetStore`. The layout tree stays the single
//! contract, so a preview and the final PDF are the same geometry drawn
//! by two backends.
//!
//! Coordinates: the layout tree is pt, top-left origin, y-down. tiny-skia
//! is px, top-left origin, y-down. A single uniform `scale` (px per pt)
//! transform bridges them, so nothing re-measures or flips axes.

use shojiku_image::AssetStore;
use shojiku_layout::{FontStore, LayoutDocument, LayoutPage};
use std::collections::HashMap;
use thiserror::Error;
use tiny_skia::{Color, Pixmap, Transform};

/// The most pixels a single rendered page may occupy, guarding against a
/// huge page times a huge scale exhausting memory.
const MAX_CANVAS_PIXELS: u64 = 64_000_000;

/// Rendering options for the PNG backend.
#[derive(Debug, Clone)]
pub struct PngOptions {
    /// Output pixels per layout point. 2.0 ≈ 144 dpi.
    pub scale: f64,
}

impl Default for PngOptions {
    fn default() -> Self {
        Self { scale: 2.0 }
    }
}

/// Errors from PNG rendering.
#[derive(Debug, Error)]
pub enum RenderPngError {
    /// The layout document has no pages.
    #[error("layout document has no pages")]
    NoPages,
    /// `scale` is not a positive finite number.
    #[error("scale {0} is not a positive finite number")]
    BadScale(f64),
    /// The page size in pt is not positive/finite.
    #[error("page size {0}x{1}pt is not positive")]
    BadPageSize(f64, f64),
    /// The scaled canvas would exceed [`MAX_CANVAS_PIXELS`].
    #[error("canvas {width}x{height}px exceeds the {cap} pixel cap")]
    TooManyPixels {
        /// Scaled canvas width in px.
        width: u64,
        /// Scaled canvas height in px.
        height: u64,
        /// The pixel cap.
        cap: u64,
    },
    /// A text block references a font id the store does not carry.
    #[error("layout references unknown font `{0}`")]
    UnknownFont(String),
    /// An image references an asset id the store does not carry.
    #[error("layout references unknown image asset `{0}`")]
    UnknownAsset(String),
    /// A raster asset failed to decode to pixels.
    #[error("image asset `{id}` could not be decoded: {reason}")]
    Decode {
        /// The asset id.
        id: String,
        /// The decoder's message.
        reason: String,
    },
    /// PNG encoding failed.
    #[error("failed to encode PNG: {0}")]
    Encode(String),
    /// The requested 0-based page index is past the document's last page.
    #[error("page index {page} is out of range (document has {total} pages)")]
    PageOutOfRange {
        /// The requested 0-based page index (echoed as given).
        page: usize,
        /// The number of pages the document has.
        total: usize,
    },
}

/// One rasterized page as un-premultiplied RGBA8 bytes, ready to hand a
/// browser canvas via `ImageData` without a PNG decode. Row-major, R,G,B,A
/// per pixel, so `rgba.len() == width_px * height_px * 4`.
#[derive(Debug, Clone)]
pub struct RawPage {
    /// Scaled canvas width in px.
    pub width_px: u32,
    /// Scaled canvas height in px.
    pub height_px: u32,
    /// Un-premultiplied RGBA8 pixels, row-major.
    pub rgba: Vec<u8>,
}

/// Renders every page of a laid-out document to PNG bytes (one per page).
pub fn render_png(
    layout: &LayoutDocument,
    fonts: &FontStore,
    assets: &AssetStore,
    options: &PngOptions,
) -> Result<Vec<Vec<u8>>, RenderPngError> {
    // Each pixmap is encoded and dropped before the next page is rasterized:
    // peak memory stays one canvas (a MAX_PAGES document would otherwise hold
    // every uncompressed page at once).
    let mut run = RenderRun::start(layout, fonts, assets, options)?;
    let mut out = Vec::with_capacity(layout.pages.len());
    for page in &layout.pages {
        let pixmap = run.rasterize(page)?;
        out.push(pixmap.encode_png().map_err(encode_error)?);
    }
    Ok(out)
}

/// Renders every page to raw un-premultiplied RGBA8 pixels (one [`RawPage`]
/// per page) — the encode-free path a WASM host paints straight to a canvas,
/// skipping the PNG encode that dominates the PNG path's time. Same layout,
/// same caps, same pixels as [`render_png`] before encoding. Unlike the PNG
/// form, the returned pages ARE the uncompressed pixels, so this path's
/// memory is inherently pages × canvas.
pub fn render_raw(
    layout: &LayoutDocument,
    fonts: &FontStore,
    assets: &AssetStore,
    options: &PngOptions,
) -> Result<Vec<RawPage>, RenderPngError> {
    let mut run = RenderRun::start(layout, fonts, assets, options)?;
    let mut out = Vec::with_capacity(layout.pages.len());
    for page in &layout.pages {
        out.push(into_raw_page(run.rasterize(page)?));
    }
    Ok(out)
}

/// Renders ONE page (0-based `page`) of a laid-out document to PNG bytes. The
/// index is bounds-checked — past the last page yields
/// [`RenderPngError::PageOutOfRange`] echoing the index as given. Same caps and
/// pixels as [`render_png`], so a selected page is byte-identical to that page
/// of the all-pages render.
pub fn render_png_page(
    layout: &LayoutDocument,
    fonts: &FontStore,
    assets: &AssetStore,
    options: &PngOptions,
    page: usize,
) -> Result<Vec<u8>, RenderPngError> {
    let mut run = RenderRun::start(layout, fonts, assets, options)?;
    let target = page_at(layout, page)?;
    run.rasterize(target)?.encode_png().map_err(encode_error)
}

/// Renders ONE page (0-based `page`) to raw un-premultiplied RGBA pixels — the
/// single-page mirror of [`render_raw`], with the same bounds check as
/// [`render_png_page`].
pub fn render_raw_page(
    layout: &LayoutDocument,
    fonts: &FontStore,
    assets: &AssetStore,
    options: &PngOptions,
    page: usize,
) -> Result<RawPage, RenderPngError> {
    let mut run = RenderRun::start(layout, fonts, assets, options)?;
    let target = page_at(layout, page)?;
    Ok(into_raw_page(run.rasterize(target)?))
}

/// The page at a 0-based index, or [`RenderPngError::PageOutOfRange`]. Reached
/// only after [`RenderRun::start`] proved at least one page, so `total` ≥ 1.
fn page_at(layout: &LayoutDocument, page: usize) -> Result<&LayoutPage, RenderPngError> {
    layout
        .pages
        .get(page)
        .ok_or(RenderPngError::PageOutOfRange {
            page,
            total: layout.pages.len(),
        })
}

/// Consumes a rasterized pixmap into an un-premultiplied [`RawPage`] — no copy
/// (the demultiply reuses the pixmap's own buffer). Shared by the all-pages and
/// single-page raw paths.
fn into_raw_page(pixmap: Pixmap) -> RawPage {
    RawPage {
        width_px: pixmap.width(),
        height_px: pixmap.height(),
        rgba: pixmap.take_demultiplied(),
    }
}

/// One validated render pass: the single home for input validation (scale,
/// page size, canvas cap) and per-page rasterization, so [`render_png`] and
/// [`render_raw`] share one pipeline while each consumes pages one at a time.
struct RenderRun<'a> {
    painter: Painter<'a>,
    width: u64,
    height: u64,
}

impl<'a> RenderRun<'a> {
    /// Validates the document and options, returning a ready pass.
    fn start(
        layout: &LayoutDocument,
        fonts: &'a FontStore,
        assets: &'a AssetStore,
        options: &PngOptions,
    ) -> Result<Self, RenderPngError> {
        if layout.pages.is_empty() {
            return Err(RenderPngError::NoPages);
        }
        let scale = options.scale;
        if !(scale.is_finite() && scale > 0.0) {
            return Err(RenderPngError::BadScale(scale));
        }
        let (pw, ph) = (layout.page_width, layout.page_height);
        if !(pw.is_finite() && pw > 0.0 && ph.is_finite() && ph > 0.0) {
            return Err(RenderPngError::BadPageSize(pw, ph));
        }
        let width = (pw * scale).ceil() as u64;
        let height = (ph * scale).ceil() as u64;
        if width.saturating_mul(height) > MAX_CANVAS_PIXELS {
            return Err(RenderPngError::TooManyPixels {
                width,
                height,
                cap: MAX_CANVAS_PIXELS,
            });
        }
        Ok(Self {
            painter: Painter {
                fonts,
                assets,
                transform: Transform::from_scale(scale as f32, scale as f32),
                glyph_cache: HashMap::new(),
            },
            width,
            height,
        })
    }

    /// Rasterizes one page onto a fresh canvas.
    fn rasterize(&mut self, page: &LayoutPage) -> Result<Pixmap, RenderPngError> {
        let mut pixmap = new_canvas(self.width, self.height)?;
        pixmap.fill(Color::WHITE);
        for item in &page.items {
            self.painter.draw_item(&mut pixmap, item, None, 0)?;
        }
        Ok(pixmap)
    }
}

/// Allocates a blank canvas. The dimensions were already validated as
/// positive and within the cap, so a `None` here means the allocation
/// itself failed; it is surfaced as the pixel-cap error rather than a
/// panic (and is unit-tested via a 0-sized request).
fn new_canvas(width: u64, height: u64) -> Result<Pixmap, RenderPngError> {
    Pixmap::new(width as u32, height as u32).ok_or(RenderPngError::TooManyPixels {
        width,
        height,
        cap: MAX_CANVAS_PIXELS,
    })
}

/// Maps a PNG-encoding failure. Named so the error path is unit-testable.
fn encode_error<E: std::fmt::Debug>(error: E) -> RenderPngError {
    RenderPngError::Encode(format!("{error:?}"))
}

mod paint;
#[cfg(test)]
mod tests;

use paint::Painter;
