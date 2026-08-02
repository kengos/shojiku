//! Unit tests for the pure checkbox helpers (placement branches the e2e
//! suite would need many contexts to reach).

use super::box_y;
use shojiku_core::{Length, OptBox};

#[test]
fn box_y_covers_absent_box_absent_y_and_present() {
    // No box at all → no offset.
    assert_eq!(box_y(None), None);
    // A box without `y` → no offset.
    let no_y = OptBox::default();
    assert_eq!(box_y(Some(&no_y)), None);
    // A box with `y` → that offset.
    let with_y = OptBox {
        y: Some(Length::Pt(7.0)),
        ..OptBox::default()
    };
    assert_eq!(box_y(Some(&with_y)), Some(Length::Pt(7.0)));
}
