//! The locale-id harness the `formatter_pack_paths` fuzz target runs beside
//! the formatter's pack-path harness, and the authoring corpus replay test
//! runs over the same seeds.
//!
//! A host builds `<locale dir>/<id>.yml` from a locale id after
//! [`valid_locale_id`] accepts it, so every accepted id must name a file
//! directly inside the locale directory. The assertion is the formatter's
//! [`shojiku_formatter::fuzz::assert_one_path_segment`], the one shared by
//! pack ids and locale ids.
//!
//! Doc-hidden `pub` rather than feature-gated, for the reason
//! `shojiku_verify`'s fuzz module gives: a feature-gated entry point is
//! compiled by `clippy --all-features` but invisible to the coverage gate.
//! Nothing here is API.

use crate::locale::valid_locale_id;
use shojiku_formatter::fuzz::assert_one_path_segment;

#[cfg(test)]
mod tests;

/// Checks the first line of `input` as a locale id, and returns whether
/// [`valid_locale_id`] accepted it.
///
/// # Panics
///
/// Panics when [`valid_locale_id`] accepts the line but
/// [`assert_one_path_segment`] fails for it.
pub fn locale_id(input: &str) -> bool {
    let candidate = input.lines().next().unwrap_or_default();
    let accepted = valid_locale_id(candidate);
    if accepted {
        assert_one_path_segment(candidate);
    }
    accepted
}
