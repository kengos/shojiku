//! The bundled-example read surface's data model: the embedded source
//! files (`embed`), the `shojiku://example/…` grammar (`uri`), and the
//! catalog that gives each entry a human title and a line saying what it
//! exercises.
//!
//! The catalog is COMPOSED, never transcribed. The 25 product entries take
//! their title and blurb from the same `examples/gallery.yml` the README
//! and the site generate from, so there is one source for that text; the 9
//! authoring-only entries (two `dev/` documents and the seven blank
//! presets, which the product gallery deliberately does not list) carry
//! their own short descriptions here. `tests.rs` pins the union against
//! the real directory.

pub(crate) mod embed;
pub(crate) mod uri;

use serde::Deserialize;
use std::sync::OnceLock;

/// One source file of an entry, embedded at compile time.
pub(crate) struct SourceFile {
    pub(crate) name: &'static str,
    pub(crate) text: &'static str,
}

impl SourceFile {
    /// The MIME type a client should read this file as.
    pub(crate) fn mime(&self) -> &'static str {
        match self.name.rsplit_once('.') {
            Some((_, "json")) => "application/json",
            _ => "application/yaml",
        }
    }
}

/// A catalog entry: an embedded entry plus the prose describing it.
pub(crate) struct CatalogEntry {
    pub(crate) id: &'static str,
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) files: &'static [SourceFile],
}

impl CatalogEntry {
    /// Combined byte length of every source file — what the bundle cap is
    /// measured against, and what `resources/list` advertises.
    pub(crate) fn size(&self) -> usize {
        self.files.iter().map(|f| f.text.len()).sum()
    }

    /// One named source file.
    pub(crate) fn file(&self, name: &str) -> Option<&'static SourceFile> {
        self.files.iter().find(|f| f.name == name)
    }
}

/// The gallery source, parsed for the two fields this surface needs.
/// Unknown keys (previews, Japanese text, `featured`) are ignored rather
/// than denied — this is a reader of someone else's file, not its owner.
#[derive(Deserialize)]
struct Gallery {
    entries: Vec<GalleryEntry>,
}

#[derive(Deserialize)]
struct GalleryEntry {
    dir: String,
    title_en: String,
    blurb_en: String,
}

/// The product gallery's own text, for the 25 entries it lists.
const GALLERY_YML: &str = include_str!("../../../examples/gallery.yml");

/// Titles and blurbs for the entries the product gallery does not list:
/// the syntax showcase and the per-locale blank presets.
const EXTRAS: &[(&str, &str, &str)] = &[
    (
        "dev/layout-showcase",
        "Layout showcase (every construct)",
        "The syntax exerciser: most of the authorable surface in one document — flex and grid, containers, tables, repeat and repeat_flow, borders, styles. Large; read its templates.yml by its own URI rather than as a bundle.",
    ),
    (
        "dev/live-flex",
        "Minimal flex invoice (the site's live editor sample)",
        "The smallest document that still shows the layout model: one flow, one flex row whose unsized children split the width, and one padded card holding a table. Three knobs move everything — page.margin, defaults.style.fontSize, and the card's box.padding. A good starting point to copy from.",
    ),
    (
        "presets/blank-a4",
        "Blank A4 (ja)",
        "An empty A4 page set up for Japanese: page size, margins and default locale, with nothing on it. A starting skeleton.",
    ),
    (
        "presets/blank-a4-en",
        "Blank A4 (en)",
        "An empty A4 page with English defaults. A starting skeleton.",
    ),
    (
        "presets/blank-a4-hi",
        "Blank A4 (hi-IN)",
        "An empty A4 page with Hindi defaults and the matching font pack. A starting skeleton.",
    ),
    (
        "presets/blank-a4-zh-cn",
        "Blank A4 (zh-CN)",
        "An empty A4 page with Simplified Chinese defaults. A starting skeleton.",
    ),
    (
        "presets/blank-a4-zh-tw",
        "Blank A4 (zh-TW)",
        "An empty A4 page with Traditional Chinese defaults. A starting skeleton.",
    ),
    (
        "presets/blank-letter-fil",
        "Blank Letter (fil-PH)",
        "An empty US Letter page with Filipino defaults. A starting skeleton.",
    ),
    (
        "presets/blank-letter-us",
        "Blank Letter (en-US)",
        "An empty US Letter page with US defaults. A starting skeleton.",
    ),
];

/// The composed catalog, built once.
pub(crate) fn catalog() -> &'static [CatalogEntry] {
    static CATALOG: OnceLock<Vec<CatalogEntry>> = OnceLock::new();
    CATALOG.get_or_init(build)
}

/// One entry by `<bucket>/<name>` id.
pub(crate) fn find(id: &str) -> Option<&'static CatalogEntry> {
    catalog().iter().find(|e| e.id == id)
}

/// Parses the gallery source for the fields this surface needs.
///
/// A gallery it cannot read degrades to an empty list rather than
/// panicking: the entries then fall back to the extras table, and only
/// their prose is poorer. The catalog itself comes from `embed::ENTRIES`,
/// so nothing disappears from the wire either way.
fn parse_gallery(source: &str) -> Vec<GalleryEntry> {
    serde_yaml::from_str::<Gallery>(source)
        .map(|g| g.entries)
        .unwrap_or_default()
}

/// Joins the embedded entries to their prose.
fn build() -> Vec<CatalogEntry> {
    let gallery = parse_gallery(GALLERY_YML);
    embed::ENTRIES
        .iter()
        .map(|e| {
            let (title, description) = describe(e.id, &gallery);
            CatalogEntry {
                id: e.id,
                title,
                description,
                files: e.files,
            }
        })
        .collect()
}

/// The prose for one id: the gallery's, else the extras table's, else the
/// id itself. The last case cannot happen against the real tree — the
/// drift test pins that — but a silent empty description would be worse
/// than a dull one, so it degrades instead of panicking.
fn describe(id: &str, gallery: &[GalleryEntry]) -> (String, String) {
    if let Some(g) = gallery.iter().find(|g| g.dir == id) {
        return (g.title_en.clone(), g.blurb_en.trim().to_string());
    }
    match EXTRAS.iter().find(|(extra, _, _)| *extra == id) {
        Some((_, title, description)) => ((*title).to_string(), (*description).to_string()),
        None => (id.to_string(), id.to_string()),
    }
}

#[cfg(test)]
mod tests;
