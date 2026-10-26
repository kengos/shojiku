//! The overflow slack: where `exceeds` draws the line between float noise
//! and a real excess.

use super::{OVERFLOW_EPS, exceeds, fit_count};

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

#[test]
fn fit_count_admits_a_step_short_by_the_slack_only() {
    assert_eq!(fit_count(20.0, 10.0), 2);
    assert_eq!(fit_count(20.0 - OVERFLOW_EPS / 2.0, 10.0), 2);
    assert_eq!(fit_count(20.0 - OVERFLOW_EPS * 2.0, 10.0), 1);
    assert_eq!(fit_count(-5.0, 10.0), 0);
}
