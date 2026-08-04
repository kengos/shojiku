//! PDF rendering: draws a [`LayoutDocument`] with krilla.
//!
//! All positioning/formatting decisions were already made by the layout
//! engine; this crate only draws. krilla shares the layout tree's
//! coordinate system (pt, top-left origin, y-down), so items map through
//! without unit or axis conversion.
//!
//! Fonts are embedded from the lang pack's TTF files; krilla subsets each
//! face to the glyphs actually used, so CJK faces no longer inflate the
//! output.

use krilla::metadata::Metadata;
use krilla::page::PageSettings;
use krilla::text::Font;
use krilla::Document;
use shojiku_image::AssetStore;
use shojiku_layout::{DocumentMetadata, FontFace, FontStore, LayoutDocument};
use std::collections::HashMap;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum RenderError {
    #[error("failed to embed font: {0}")]
    Embed(String),
    #[error("layout references unknown font `{0}`")]
    UnknownFont(String),
    #[error("layout references unknown image asset `{0}`")]
    UnknownAsset(String),
    #[error("image asset `{id}` was rejected by the PDF backend: {reason}")]
    BadImage { id: String, reason: String },
    #[error("layout document has no pages")]
    NoPages,
    #[error("page size {0}x{1}pt is not positive")]
    BadPageSize(f64, f64),
    #[error("failed to write PDF bytes: {0}")]
    Write(String),
}

/// Renders a laid-out document to PDF bytes.
pub fn render_pdf(
    layout: &LayoutDocument,
    fonts: &FontStore,
    assets: &AssetStore,
) -> Result<Vec<u8>, RenderError> {
    if layout.pages.is_empty() {
        return Err(RenderError::NoPages);
    }

    let mut document = Document::new();
    document.set_metadata(metadata_of(&layout.metadata));

    // Wrap every face the store carries; layouts reference them by id.
    // krilla only embeds (and subsets) faces that actually draw glyphs,
    // so unused faces cost nothing in the output.
    //
    // The eager `ok_or` keeps this practically-unreachable failure path —
    // krilla parses with the same fontations stack the FontStore already
    // validated against — on an always-executed line, and `embed_error`
    // stays directly unit-testable.
    let mut embedded: HashMap<String, (&FontFace, Font)> = HashMap::new();
    for face in fonts.faces() {
        let font = Font::new(face.data.clone().into(), 0).ok_or(embed_error(&face.id))?;
        embedded.insert(face.id.clone(), (face, font));
    }

    for page_layout in &layout.pages {
        let (w, h) = (layout.page_width, layout.page_height);
        let settings =
            PageSettings::from_wh(w as f32, h as f32).ok_or(RenderError::BadPageSize(w, h))?;
        // Link annotations (LK1) are page-level, not surface draws:
        // collect them from the same tree, add after the surface closes.
        let mut annotations = Vec::new();
        annot::collect_annotations(&page_layout.items, 0, &mut annotations);
        let mut page = document.start_page_with(settings);
        let mut surface = page.surface();
        for item in &page_layout.items {
            draw_item(&mut surface, item, &embedded, assets, 0)?;
        }
        surface.finish();
        for annotation in annotations {
            page.add_annotation(annotation);
        }
        page.finish();
    }

    document.finish().map_err(write_error)
}

/// The krilla metadata for a resolved [`DocumentMetadata`]. Layout has
/// already interpolated and gated every value (control characters,
/// length, and the language tag's charset — XMP writes that one
/// unescaped), so this only maps field for field.
///
/// `creation_date` is deliberately never set: krilla writes no date
/// unless given one, which is what keeps the same inputs producing the
/// same bytes.
fn metadata_of(meta: &DocumentMetadata) -> Metadata {
    let mut out = Metadata::new().title(meta.title.clone());
    if let Some(description) = &meta.description {
        out = out.description(description.clone());
    }
    if let Some(language) = &meta.language {
        out = out.language(language.clone());
    }
    out.keywords(meta.keywords.clone())
        .authors(meta.authors.clone())
}

/// Maps a font-wrapping failure. Named (rather than a closure) so the
/// error path can be exercised directly by tests.
fn embed_error(id: &str) -> RenderError {
    RenderError::Embed(format!("font `{id}` was rejected by the PDF backend"))
}

/// Maps a PDF-serialization failure. Named for the same reason.
fn write_error<E: std::fmt::Debug>(error: E) -> RenderError {
    RenderError::Write(format!("{error:?}"))
}

mod annot;
mod draw;
mod paint;
#[cfg(test)]
mod tests;
mod text;

use draw::draw_item;
