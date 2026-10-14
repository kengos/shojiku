//! The removal-due comparison: numeric per component, pre-release suffixes
//! ignored so a release candidate of the removing release is already due.

use super::Deprecation;

const WINDOW: Deprecation = Deprecation {
    since: "0.3.0",
    removed_in: "0.4.0",
};

#[test]
fn a_removal_is_due_from_its_release_on() {
    for (version, due) in [
        ("0.2.0", false),
        ("0.3.9", false),
        ("0.3.10", false),
        ("0.4.0-rc.1", true),
        ("0.4.0", true),
        ("0.10.0", true),
        ("1.0.0", true),
    ] {
        assert_eq!(WINDOW.is_due_at(version), due, "{version}");
    }
}

#[test]
fn a_component_that_is_not_a_number_reads_as_zero() {
    assert!(!WINDOW.is_due_at("x.y.z"));
    assert!(WINDOW.is_due_at("0.4"));
}

#[test]
fn a_table_version_must_be_a_plain_release() {
    assert!(WINDOW.is_release());
    for (since, removed_in) in [
        ("0.3.0", "4.0"),
        ("0.3", "0.4.0"),
        ("0.3.0", "0.4.0-rc.1"),
        ("0.3.0", "0..0"),
    ] {
        let window = Deprecation { since, removed_in };
        assert!(!window.is_release(), "{since} {removed_in}");
    }
}
