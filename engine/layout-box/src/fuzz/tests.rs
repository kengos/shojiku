//! The token readers and the tolerance check the box harnesses share.

use super::*;

#[test]
fn tokens_read_numbers_and_settings() {
    assert_eq!(number("1e308"), Some(1e308));
    assert!(number("NaN").is_some_and(f64::is_nan));
    assert_eq!(number("-"), None);
    assert_eq!(setting("a=1 b=2", "b"), Some("2"));
    assert_eq!(setting("a=1 b", "b"), None);
    assert!(in_range(-MAX_RESOLVED_PT) && !in_range(f64::INFINITY));
}

#[test]
fn body_lines_skip_the_settings_and_blank_lines() {
    let lines: Vec<&str> = body_lines("s\na\n\n  \nb\n").collect();
    assert_eq!(lines, ["a", "b"]);
}

#[test]
#[should_panic(expected = "share: 2 is over 1")]
fn a_value_over_the_limit_fails() {
    assert_at_most(2.0, 1.0, "share");
}

#[test]
#[should_panic(expected = "sum: 2 is not 1")]
fn a_value_outside_the_tolerance_fails() {
    assert_close(2.0, 1.0, 0.0, "sum");
}
