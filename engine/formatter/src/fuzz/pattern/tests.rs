//! The `formatter_pattern` harness: patterns and overlays that reach the
//! renderer pass every assertion, and the length assertion panics on a text
//! longer than its bound.

use super::*;

#[test]
fn a_pattern_renders_with_builtin_and_overlaid_era_tables() {
    assert_eq!(date_pattern("2019-05-01\nGGy年M月d日(E) HH:mm a"), 2);
    assert_eq!(
        date_pattern("2026-11-06T09:30:00+09:00\nyyyy/MM/dd 'y' MMMM EEEE hh h H"),
        2
    );
    // Unsorted eras, one starting before year 1, and no abbreviation.
    let rendered = date_pattern(
        "0001-01-01\nG GG y\neras:\n  - { name: B, start: \"1000-01-01\" }\n  - { name: A, start: \"-542-01-01\" }\neraYearOne: first\n",
    );
    assert_eq!(rendered, 2);
}

#[test]
fn a_value_or_overlay_the_formatter_refuses_renders_nothing() {
    assert_eq!(date_pattern("not a date\nyyyy"), 0);
    assert_eq!(date_pattern("2026-01-01\ny\neras: [ unterminated"), 0);
    assert_eq!(date_pattern(""), 0);
}

#[test]
fn an_empty_registered_pattern_renders_an_empty_text() {
    // The second line is empty, so the registered pattern is the empty
    // string. The harness bounds the rendered length by the pattern length,
    // which is zero here; a pack default used in place of the empty pattern
    // would exceed that bound and panic. The return value 2 means both the
    // date and the datetime render succeeded.
    assert_eq!(date_pattern("2026-01-01\n"), 2);
}

#[test]
fn calendar_date_reads_only_a_ten_character_prefix() {
    assert_eq!(calendar_date("2026-11-06T00:00:00Z"), Some((2026, 11, 6)));
    assert_eq!(calendar_date("2026-11"), None);
    assert_eq!(calendar_date("2026-xx-06"), None);
}

#[test]
fn the_longest_token_counts_an_overlaid_era_year_one() {
    let pack = LangPack::builtin("ja-JP", Some("eraYearOne: twelve-chars\n"))
        .expect("the overlay parses")
        .expect("ja-JP is builtin");
    assert_eq!(longest_token(&pack), "twelve-chars".len());
}

#[test]
#[should_panic(expected = "characters rendered")]
fn a_text_longer_than_the_bound_panics() {
    let pack = LangPack::builtin("ja-JP", None)
        .expect("the builtin parses")
        .expect("ja-JP is builtin");
    let text = "x".repeat(LONGEST_NUMBER + 1);
    assert_rendered_length(&text, "y", &pack);
}
