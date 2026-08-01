//! Unit tests for the verification report.

use super::*;

const BAD: CheckOutcome = CheckOutcome::Failed { reason: "no" };

fn report(
    signature: CheckOutcome,
    coverage: CheckOutcome,
    validity: CheckOutcome,
    trust: CheckOutcome,
) -> VerificationReport {
    VerificationReport::new(signature, coverage, validity, trust)
}

fn all_passed() -> VerificationReport {
    report(
        CheckOutcome::Passed,
        CheckOutcome::Passed,
        CheckOutcome::Passed,
        CheckOutcome::Passed,
    )
}

#[test]
fn a_verdict_is_valid_only_when_every_check_passed() {
    assert!(all_passed().is_valid());
    let passed = CheckOutcome::Passed;
    // One failure at a time, so no single check can be the one the verdict
    // silently ignores.
    assert!(!report(BAD, passed, passed, passed).is_valid());
    assert!(!report(passed, BAD, passed, passed).is_valid());
    assert!(!report(passed, passed, BAD, passed).is_valid());
    assert!(!report(passed, passed, passed, BAD).is_valid());
}

#[test]
fn every_check_is_readable_on_its_own() {
    let one = report(CheckOutcome::Passed, BAD, CheckOutcome::Passed, BAD);
    assert_eq!(one.signature(), CheckOutcome::Passed);
    assert_eq!(one.coverage(), BAD);
    assert_eq!(one.certificate_validity(), CheckOutcome::Passed);
    assert_eq!(one.trust_chain(), BAD);
}

#[test]
fn the_omissions_are_reported_on_a_passing_verdict_too() {
    // The whole point of the field: a "valid" verdict that quietly skipped
    // revocation would turn a missing capability into a false assurance.
    let report = all_passed();
    assert!(report.is_valid());
    assert_eq!(
        report.not_checked(),
        &[NotChecked::Revocation, NotChecked::Timestamp]
    );
}

#[test]
fn a_check_reports_whether_it_passed() {
    assert!(CheckOutcome::Passed.is_passed());
    assert!(!CheckOutcome::failed("because").is_passed());
}

#[test]
fn the_serialized_shape_carries_the_verdict_the_checks_and_the_omissions() {
    let json = serde_json::to_value(report(
        CheckOutcome::Passed,
        CheckOutcome::failed("the signed range does not reach the end of the file"),
        CheckOutcome::Passed,
        CheckOutcome::Passed,
    ))
    .expect("serializes");
    assert_eq!(json["valid"], serde_json::json!(false));
    assert_eq!(json["signature"], serde_json::json!({ "status": "passed" }));
    assert_eq!(
        json["coverage"],
        serde_json::json!({
            "status": "failed",
            "reason": "the signed range does not reach the end of the file"
        })
    );
    assert_eq!(json["certificateValidity"]["status"], "passed");
    assert_eq!(json["trustChain"]["status"], "passed");
    assert_eq!(
        json["notChecked"],
        serde_json::json!(["revocation", "timestamp"])
    );
}
