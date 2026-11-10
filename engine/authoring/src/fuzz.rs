//! The fuzz harnesses of the authoring crate: the locale-id check the
//! `formatter_pack_paths` fuzz target runs (`locale`), and the format
//! catalog the `authoring_format_catalog` fuzz target of the `host` group
//! runs (`catalog`). Each fuzz target and its corpus replay test call the
//! same function, so CI runs the assertions the fuzzer does.
//!
//! Doc-hidden `pub` rather than feature-gated, for the reason
//! `shojiku_verify`'s fuzz module gives: a feature-gated entry point is
//! compiled by `clippy --all-features` but invisible to the coverage gate.
//! Nothing here is API.

mod catalog;
mod locale;

pub use catalog::{CatalogPaths, catalog};
pub use locale::locale_id;
