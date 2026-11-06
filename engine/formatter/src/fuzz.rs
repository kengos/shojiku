//! The harnesses the `formatter_pattern` and `formatter_pack_paths` fuzz
//! targets and the corpus replay tests both run.
//!
//! Each harness drives a public entry point with one fuzz input and asserts
//! a property that entry point's documentation promises, so a broken
//! property is a panic, which is what a fuzzer reports:
//!
//! - [`date_pattern`]: a date/datetime pattern from a template's `formats:`
//!   registry, rendered by `format_value` against a ja-JP pack whose era and
//!   name tables an overlay may rewrite — `LangPack::era_for` never returns
//!   an era year below 1 for the value's `yyyy-mm-dd` prefix, and the
//!   rendered text is bounded by the pattern length.
//! - [`pack_paths`]: a locale pack's `fonts.uses` and an injected font-pack
//!   manifest resolved by both bytes-first resolvers — no returned face was
//!   declared with an absolute `file` or a `file` with a `..` segment, the
//!   strict and the subset resolver agree, and an id the pack-id check
//!   accepts is one path segment.
//!
//! Doc-hidden `pub` rather than feature-gated, for the reason
//! `shojiku_verify`'s fuzz module gives: a feature-gated entry point is
//! compiled by `clippy --all-features` but invisible to the coverage gate.
//! Nothing here is API.

mod paths;
mod pattern;

pub use paths::{assert_one_path_segment, pack_paths};
pub use pattern::date_pattern;
