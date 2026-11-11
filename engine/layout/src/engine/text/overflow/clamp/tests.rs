//! Unit tests for the cut-point search: which candidate it keeps, how many
//! prefixes it shapes, and what it does after `max_shapings` prefixes are shaped.
//! The widths are synthetic (1pt per char) so each case states exactly
//! which prefixes have a known width.

use super::*;

/// Runs `kept_len` on `text` with 1pt per char as the shaped width and
/// returns what it decided and the number of prefixes shaped.
fn search(
    text: &str,
    content_w: f64,
    known: &[(usize, f64)],
    max_shapings: usize,
) -> (Kept, usize) {
    let mut shaped = 0;
    let kept = kept_len(
        text,
        1.0,
        content_w,
        known,
        |prefix| {
            shaped += 1;
            prefix.chars().count() as f64
        },
        max_shapings,
    );
    (kept, shaped)
}

fn kept(len: usize, bound_reached: bool) -> Kept {
    Kept { len, bound_reached }
}

#[test]
fn keeps_the_longest_prefix_that_fits_with_the_ellipsis() {
    // 1pt per char plus the 1pt ellipsis: 10pt of room keeps 9 chars.
    assert_eq!(search(&"a".repeat(20), 10.0, &[], 64), (kept(9, false), 12));
}

#[test]
fn a_known_width_is_used_without_shaping() {
    let text = "a".repeat(20);
    let known: Vec<(usize, f64)> = (1..=20).map(|n| (n, n as f64)).collect();
    assert_eq!(search(&text, 10.0, &known, 64), (kept(9, false), 0));
}

#[test]
fn a_prohibited_or_whitespace_candidate_is_skipped_without_shaping() {
    // 10,000 opening brackets after one char: every candidate but the
    // first char is skipped before any width is looked up.
    let text = format!("a{}", "「".repeat(10_000));
    assert_eq!(search(&text, 10.0, &[], 64), (kept(1, false), 1));
    // A candidate ending in whitespace is skipped the same way.
    assert_eq!(search("ab \u{3000}", 10.0, &[], 64), (kept(2, false), 1));
}

#[test]
fn returns_zero_when_no_candidate_fits() {
    assert_eq!(search("aaaa", 0.5, &[], 64), (kept(0, false), 4));
}

#[test]
fn after_max_shapings_prefixes_are_shaped_the_longest_known_candidate_that_fits_is_kept() {
    let text = "a".repeat(200);
    // Three shapings cover the candidates of 200, 199 and 198 chars; none of the three
    // fits. The remaining candidates with no known width are skipped, and
    // the known width at 50 chars fits.
    let known = [(20, 20.0), (50, 50.0), (150, 150.0)];
    assert_eq!(search(&text, 100.0, &known, 3), (kept(50, true), 3));
}

#[test]
fn after_max_shapings_prefixes_are_shaped_with_no_known_candidate_nothing_is_kept() {
    assert_eq!(search(&"a".repeat(200), 100.0, &[], 3), (kept(0, true), 3));
}

#[test]
fn a_shaping_bound_of_zero_shapes_nothing() {
    assert_eq!(
        search(&"a".repeat(30), 100.0, &[(5, 5.0)], 0),
        (kept(5, true), 0)
    );
}
