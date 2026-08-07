//! The compile-time example table: every bundled entry's source files,
//! embedded with `include_str!` so the surface works identically from a
//! checkout and from the docker image, needs no root path, and cannot be
//! pointed at anything outside this list.
//!
//! The relative paths reach the repo-root `examples/` tree from this file's
//! directory — the one place in the crate that knows the repo layout. The
//! set is NOT hand-trusted: `tests.rs` walks the real tree and fails if this
//! table and the directory disagree, in either direction.

use super::SourceFile;

/// One embedded entry: its `<bucket>/<name>` id and its source files.
pub(crate) struct Embedded {
    pub(crate) id: &'static str,
    pub(crate) files: &'static [SourceFile],
}

/// Embeds one entry's source files by name, relative to the repo root.
macro_rules! entry {
    ($id:literal, [$($file:literal),+ $(,)?]) => {
        Embedded {
            id: $id,
            files: &[$(
                SourceFile {
                    name: $file,
                    text: include_str!(concat!("../../../../examples/", $id, "/", $file)),
                },
            )+],
        }
    };
}

/// Every entry the read surface serves, ordered by id.
///
/// `dev/site-hero` and `dev/site-icon` are deliberately absent: they
/// generate site artwork and teach an authoring agent nothing. The
/// exclusion is asserted in `tests.rs`, so dropping an entry by accident
/// fails the build rather than silently shrinking the catalog.
pub(crate) const ENTRIES: &[Embedded] = &[
    entry!(
        "business/catalog-ja",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "business/delivery-note-ja",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "business/estimate-ja",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "business/event-tickets-ja",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "business/invoice-en",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "business/invoice-ja",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "business/pickup-slip-ja",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "business/receipt-fil-ph",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "business/receipt-hi-in",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "business/receipt-ja",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "business/receipt-us",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "business/receipt-zh-cn",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "business/receipt-zh-tw",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "business/restaurant-menu-us",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "business/shipping-labels-ja",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "dev/layout-showcase",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "dev/live-flex",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "forms/application-form-ja",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "forms/certificate-en",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "forms/certificate-ja",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "forms/rirekisho-ja",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "lifestyle/recipe-booklet-en",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!("presets/blank-a4", ["templates.yml", "params.json"]),
    entry!("presets/blank-a4-en", ["templates.yml", "params.json"]),
    entry!("presets/blank-a4-hi", ["templates.yml", "params.json"]),
    entry!("presets/blank-a4-zh-cn", ["templates.yml", "params.json"]),
    entry!("presets/blank-a4-zh-tw", ["templates.yml", "params.json"]),
    entry!("presets/blank-letter-fil", ["templates.yml", "params.json"]),
    entry!("presets/blank-letter-us", ["templates.yml", "params.json"]),
    entry!(
        "typography/genkoyoshi-ja",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "typography/genkoyoshi-yoko-ja",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "typography/kokugo-print-ja",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
    entry!(
        "typography/novel-ja",
        ["templates.yml", "definitions.yml", "params.json"]
    ),
];
