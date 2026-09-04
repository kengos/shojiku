//! Unit tests for plain-text line placement.

use super::*;
use crate::font::test_support::ja_store;

#[test]
fn trailing_advance_measures_the_last_char_and_is_zero_when_empty() {
    let f = ja_store().get("biz-ud-gothic").expect("fixed-pitch face");
    // Fixed-pitch: a fullwidth comma advances exactly 1em (10pt).
    assert!((trailing_advance(&[f], "あ、", 10.0, 0.0) - 10.0).abs() < 1e-9);
    // Empty line → no trailing char to exclude.
    assert_eq!(trailing_advance(&[f], "", 10.0, 0.0), 0.0);
}
