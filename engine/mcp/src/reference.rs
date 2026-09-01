//! The authoring-reference read surface's data model: the embedded pages
//! (`embed`), their front matter and body (`page`), the
//! `shojiku://reference/…` grammar (`uri`), and resolution into the key
//! catalog (`nodes`).
//!
//! An agent installed the advertised way — `docker pull` plus
//! `claude mcp add` — has no checkout, so `docs/engine/` is unreachable to
//! it. The bundled examples show what a working document looks like; this
//! surface is what answers "which construct do I pick, and what keys does
//! it take" without one.
//!
//! A page serves BOTH halves: the markdown, which carries the syntax
//! examples and the `## Limitations` the catalog cannot express, and the
//! page's catalog shapes as a JSON Schema fragment, which is the machine
//! half. The page→shape map is the page's own front matter, so there is no
//! third artifact to keep in step.

pub(crate) mod embed;
pub(crate) mod nodes;
pub(crate) mod page;
pub(crate) mod uri;

pub(crate) use page::Page;
use std::sync::OnceLock;

/// Every page, parsed once.
pub(crate) fn catalog() -> &'static [Page] {
    static CATALOG: OnceLock<Vec<Page>> = OnceLock::new();
    CATALOG.get_or_init(build)
}

/// One page by its stem.
pub(crate) fn find(stem: &str) -> Option<&'static Page> {
    catalog().iter().find(|p| p.stem == stem)
}

/// Parses the embedded set, dropping anything malformed. `tests` pins the
/// count against the real directory, so a drop is a build failure rather
/// than a quietly shorter catalog.
fn build() -> Vec<Page> {
    embed::PAGES
        .iter()
        .filter_map(|p| page::parse(p.stem, p.source))
        .collect()
}

#[cfg(test)]
mod tests;
