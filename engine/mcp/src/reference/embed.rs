//! The compile-time reference table: every page of the authoring reference,
//! embedded with `include_str!` so the surface works identically from a
//! checkout and from the docker image, needs no root path, and cannot be
//! pointed at anything outside this list.
//!
//! The relative paths reach the repo-root `docs/engine/` tree from this
//! file's directory — the one place in the crate that knows where the
//! reference lives. Embedding promotes `docs/engine/` to a COMPILE-time
//! input of this crate; `docker/Dockerfile`'s builder stage copies it for
//! exactly that reason, the way it already copies `examples/`.
//!
//! The set is NOT hand-trusted: `super::tests` walks the real directory and
//! fails if this table and the tree disagree, in either direction.

/// One page's stem and its embedded markdown source.
pub(crate) struct PageSource {
    pub(crate) stem: &'static str,
    pub(crate) source: &'static str,
}

/// Embeds one page by its file stem, relative to the repo root.
macro_rules! page {
    ($stem:literal) => {
        PageSource {
            stem: $stem,
            source: include_str!(concat!("../../../../docs/engine/", $stem, ".md")),
        }
    };
}

/// Every reference page the read surface serves, ordered by stem.
///
/// `features.md` is deliberately absent: it is the development-facing
/// inventory and decision log, not authorable syntax, and it is the one
/// file in `docs/engine/` that carries no `reference:` front-matter. The
/// exclusion is asserted in `super::tests`, so dropping a page by accident
/// fails the build rather than silently shrinking the catalog.
pub(crate) const PAGES: &[PageSource] = &[
    page!("README"),
    page!("box"),
    page!("char_grid"),
    page!("container"),
    page!("data-binding"),
    page!("defaults"),
    page!("definitions"),
    page!("diagnostics"),
    page!("document"),
    page!("flex"),
    page!("flow"),
    page!("fonts"),
    page!("form_marks"),
    page!("grid"),
    page!("image"),
    page!("layout-model"),
    page!("length"),
    page!("line"),
    page!("link"),
    page!("list"),
    page!("page"),
    page!("page_break"),
    page!("page_number"),
    page!("qr_code"),
    page!("rect"),
    page!("repeat"),
    page!("repeat_flow"),
    page!("style"),
    page!("table"),
    page!("template"),
    page!("text"),
    page!("vertical_text"),
    page!("visible"),
];
