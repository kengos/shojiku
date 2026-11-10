//! The locale-id fuzz harness over an accepted and a refused id.

use super::*;

#[test]
fn an_accepted_locale_id_is_one_path_segment() {
    assert!(locale_id("ja-JP\nrest of the input"));
}

#[test]
fn a_refused_locale_id_skips_the_path_segment_assertion() {
    assert!(!locale_id("../ja-JP"));
    assert!(!locale_id(""));
}
