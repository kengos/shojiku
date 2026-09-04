//! Unit tests for `#rrggbb` color parsing.

use super::*;

#[test]
fn parses_valid_colors() {
    assert_eq!(parse_color("#000000"), Some((0.0, 0.0, 0.0)));
    assert_eq!(parse_color("#ffffff"), Some((1.0, 1.0, 1.0)));
    let (r, g, b) = parse_color("#336699").expect("color");
    assert!((r - 0.2).abs() < 0.01);
    assert!((g - 0.4).abs() < 0.01);
    assert!((b - 0.6).abs() < 0.01);
}

#[test]
fn rejects_malformed_colors() {
    assert_eq!(parse_color("336699"), None);
    assert_eq!(parse_color("#33669"), None);
    assert_eq!(parse_color("#3366999"), None);
    assert_eq!(parse_color("#zzzzzz"), None);
    assert_eq!(parse_color(""), None);
}
