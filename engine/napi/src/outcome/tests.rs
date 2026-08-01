//! The owned outcome's own shape.

use super::*;

#[test]
fn an_empty_outcome_carries_the_status_and_nothing_else() {
    let outcome = Outcome::empty(7);
    assert_eq!(outcome.status, 7);
    assert!(!outcome.success);
    assert_eq!(
        outcome,
        Outcome {
            status: 7,
            ..Outcome::default()
        }
    );
}
