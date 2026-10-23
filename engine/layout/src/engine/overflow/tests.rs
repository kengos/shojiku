//! The overflow slack: where `exceeds` draws the line between float noise
//! and a real excess.

use super::{OVERFLOW_EPS, exceeds};

#[test]
fn an_excess_within_the_slack_is_not_overflow() {
    assert!(!exceeds(99.0, 100.0));
    assert!(!exceeds(100.0, 100.0));
    assert!(!exceeds(100.0 + OVERFLOW_EPS / 2.0, 100.0));
}

#[test]
fn an_excess_past_the_slack_is_overflow() {
    assert!(exceeds(100.0 + OVERFLOW_EPS * 2.0, 100.0));
    assert!(exceeds(0.5, 0.0));
}
