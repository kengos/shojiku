//! Font loading and text measurement.
//!
//! Faces come from font packs (`packs/fonts/<pack>/`) that a locale's
//! `uses` list references; store construction (filesystem + injected-bytes
//! loaders, sha256/fsType verification) lives in `font/load.rs`. Metrics
//! ride `skrifa` (fontations); shaping (kerning, ligatures) rides
//! `harfrust` behind `font/shape.rs`.

#[cfg(test)]
mod decoration_tests;
mod face;
mod load;
mod shape;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod variant_tests;
mod verify;
pub(crate) mod vertical;

pub use face::{FontFace, PositionedGlyph};
pub(crate) use shape::char_width;
pub use shape::{all_missing, run_width, shape_run, RunOptions};
pub(crate) use vertical::vertical_extent;
pub use vertical::{arrange_vertical, down_advance_over, VGlyph};
// The pack-integrity rules, exposed so a pack GENERATOR satisfies exactly
// what the loader checks rather than reimplementing either rule.
pub use verify::{embedding_restricted, face_sha256};

use shojiku_core::{FontStyle, FontWeight};
use shojiku_diagnostics::Echo;
use shojiku_formatter::PackError;
use std::collections::HashMap;
use thiserror::Error;

/// A face chosen for a `(family, weight, style)` request, plus whether
/// the picked face actually provides the requested bold/italic (so the
/// caller can drop synthetic emboldening/skew when a real variant exists).
pub struct ResolvedFace<'a> {
    pub face: &'a FontFace,
    pub real_bold: bool,
    pub real_italic: bool,
}

/// A resolved primary face plus its fallback chain (F3): `faces` is
/// `[primary, …fallbacks]` for shaping/measuring; `fallback_ids` are the
/// resolved fallback face ids the tree carries so renderers rebuild the
/// same chain.
pub struct ResolvedChain<'a> {
    pub primary: ResolvedFace<'a>,
    pub faces: Vec<&'a FontFace>,
    pub fallback_ids: Vec<String>,
}

/// Font loading and resolution failures.
///
/// Face ids, family ids, locale ids and file paths all come from a locale
/// pack or a font-pack manifest — untrusted input — so each is an [`Echo`].
/// The `skrifa` and `std::io` sources stay typed: their text is written by
/// the library and the OS, not by the document.
#[derive(Debug, Error)]
pub enum FontError {
    #[error("failed to read font file {path}: {source}")]
    Io { path: Echo, source: std::io::Error },
    #[error("failed to parse font {id}: {source}")]
    Parse {
        id: Echo,
        source: skrifa::raw::ReadError,
    },
    #[error("locale `{0}` declares no fonts; cannot render text")]
    NoFonts(Echo),
    #[error("unknown font face `{0}`")]
    UnknownFace(Echo),
    #[error("failed to resolve font pack: {0}")]
    Pack(#[from] PackError),
    #[error("font `{0}` failed sha256 integrity check")]
    Sha256Mismatch(Echo),
    #[error("font `{0}` embedding is restricted by its fsType (font_embedding_restricted)")]
    EmbeddingRestricted(Echo),
}

/// All faces loaded from a lang pack, addressable by id.
#[derive(Debug)]
pub struct FontStore {
    faces: HashMap<String, FontFace>,
    order: Vec<String>,
    default_id: String,
    /// Locale fallback chain (F3): face/family ids tried in order for
    /// glyphs the primary face cannot map. Empty = no fallback.
    fallback: Vec<String>,
}

impl FontStore {
    pub fn default_id(&self) -> &str {
        &self.default_id
    }

    /// All face ids in declaration order (for embedding).
    pub fn face_ids(&self) -> &[String] {
        &self.order
    }

    /// All faces in declaration order (for embedding).
    pub fn faces(&self) -> impl Iterator<Item = &FontFace> {
        // `order` only ever contains keys of `faces` by construction.
        self.order.iter().filter_map(|id| self.faces.get(id))
    }

    /// Resolves a face by id, or the default face for `None`/unknown ids.
    pub fn face(&self, id: Option<&str>) -> &FontFace {
        // Indexing is safe: both constructors reject a `default_id` that is
        // not present in `faces`, and the map is never mutated afterwards.
        id.and_then(|id| self.faces.get(id))
            .unwrap_or_else(|| &self.faces[&self.default_id])
    }

    /// Face-variant selection: picks the face for a `family`
    /// (falling back to the default face's family when `None`/unknown).
    /// The weight and style axes fall back **independently** — exact
    /// `(weight, style)`, else the requested weight at normal style, else
    /// the requested style at normal weight, else the family's regular —
    /// so a `bold italic` request against a family with only a real bold
    /// face keeps the real bold and only synthesizes the italic.
    /// `real_bold`/`real_italic` report whether the picked face genuinely
    /// provides each, so the caller drops the matching synthetic effect.
    /// Declaration order breaks ties.
    pub fn resolve(
        &self,
        family: Option<&str>,
        weight: FontWeight,
        style: FontStyle,
    ) -> ResolvedFace<'_> {
        // Indexing is safe throughout: `default_id` is present by
        // construction, and every id `find` yields is a key of `order`
        // (hence of `faces`); the map is never mutated after construction.
        let default = &self.faces[&self.default_id];
        let fam = family
            .filter(|f| self.has_family(f))
            .unwrap_or_else(|| default.family());
        let id = self
            .find(fam, weight, style)
            .or_else(|| self.find(fam, weight, FontStyle::Normal))
            .or_else(|| self.find(fam, FontWeight::Normal, style))
            .or_else(|| self.find(fam, FontWeight::Normal, FontStyle::Normal))
            .unwrap_or(&self.default_id);
        let face = &self.faces[id];
        ResolvedFace {
            face,
            real_bold: face.weight() == FontWeight::Bold,
            real_italic: face.style() == FontStyle::Italic,
        }
    }

    /// Resolves the primary face for `(family, weight, style)` plus the
    /// locale fallback chain (F3): each fallback id is resolved at the
    /// same weight/style; duplicates (a fallback that lands on a face
    /// already in the chain, e.g. self-fallback) are dropped. The
    /// returned `faces` is `[primary, …fallbacks]` for shaping.
    pub fn resolve_chain(
        &self,
        family: Option<&str>,
        weight: FontWeight,
        style: FontStyle,
    ) -> ResolvedChain<'_> {
        let primary = self.resolve(family, weight, style);
        let mut faces = vec![primary.face];
        let mut fallback_ids = Vec::new();
        for id in &self.fallback {
            let face = self.resolve(Some(id), weight, style).face;
            if !faces.iter().any(|f| f.id == face.id) {
                faces.push(face);
                fallback_ids.push(face.id.clone());
            }
        }
        ResolvedChain {
            primary,
            faces,
            fallback_ids,
        }
    }

    /// True when any loaded face declares this family.
    /// Whether any loaded face belongs to `family` (or has it as id).
    pub fn has_family(&self, family: &str) -> bool {
        self.faces.values().any(|f| f.family() == family)
    }

    /// First face (declaration order) matching family + weight + style.
    fn find(&self, family: &str, weight: FontWeight, style: FontStyle) -> Option<&String> {
        self.order.iter().find(|id| {
            let f = &self.faces[*id];
            f.family() == family && f.weight() == weight && f.style() == style
        })
    }

    /// Resolves a face id the same way `face` does, returning the id.
    pub fn resolve_id<'a>(&'a self, id: Option<&'a str>) -> &'a str {
        match id {
            Some(id) if self.faces.contains_key(id) => id,
            _ => &self.default_id,
        }
    }

    /// Looks up a face by exact id (for the renderer).
    pub fn get(&self, id: &str) -> Option<&FontFace> {
        self.faces.get(id)
    }
}

#[cfg(test)]
pub(crate) mod test_support {
    use super::*;
    use shojiku_formatter::LangPack;
    use std::path::PathBuf;

    fn repo() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packs")
    }

    pub fn repo_font_dir() -> PathBuf {
        repo().join("fonts")
    }

    /// Loaded once per test binary — pack loading sha256-verifies every
    /// face (incl. the ~47MB IPAmj fallback), far too slow per test.
    pub fn ja_store() -> &'static FontStore {
        static STORE: std::sync::OnceLock<FontStore> = std::sync::OnceLock::new();
        STORE.get_or_init(|| {
            let pack = LangPack::builtin("ja-JP", None)
                .expect("parse builtin ja-JP")
                .expect("builtin ja-JP exists");
            FontStore::load_from_pack(&pack, &[repo_font_dir()]).expect("load fonts")
        })
    }
}
