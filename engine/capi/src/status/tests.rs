//! Tests for the two failure levels and the panic shield.

use super::*;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode, Diagnostics};

/// A diagnostics list with one error in it.
fn one_error() -> Diagnostics {
    let mut diagnostics = Diagnostics::new();
    diagnostics.push(Diagnostic::new(DiagnosticCode::ImageSourceMissing));
    diagnostics
}

#[test]
fn caller_mistakes_report_their_own_status() {
    let cases: [(Failure, i32); 6] = [
        (Failure::NullArg("out"), SHOJIKU_ERR_NULL_ARG),
        (Failure::InvalidUtf8("request"), SHOJIKU_ERR_INVALID_UTF8),
        (
            Failure::InvalidRequest("bad".into()),
            SHOJIKU_ERR_INVALID_REQUEST,
        ),
        (
            Failure::TooLarge {
                what: "pdf",
                len: 2,
                max: 1,
            },
            SHOJIKU_ERR_TOO_LARGE,
        ),
        (
            Failure::OutOfRange { index: 9, total: 2 },
            SHOJIKU_ERR_OUT_OF_RANGE,
        ),
        (Failure::Panic("boom".into()), SHOJIKU_ERR_PANIC),
    ];
    for (failure, expected) in cases {
        assert_eq!(failure.status(), expected);
    }
}

#[test]
fn an_operation_that_ran_and_failed_still_reports_ok() {
    // The whole point of the two-level split: an SDK must be able to tell
    // "you called this wrong" from "the document is wrong", and only the
    // first is exceptional.
    assert_eq!(
        Failure::host("sign", "key", &"unusable").status(),
        SHOJIKU_OK
    );
    assert_eq!(
        Failure::document("render", &one_error()).status(),
        SHOJIKU_OK
    );
}

#[test]
fn a_document_failure_carries_the_engine_diagnostics_and_others_do_not() {
    let result = Failure::document("render", &one_error()).into_result();
    assert!(result
        .diagnostics_for_test()
        .contains("image_source_missing"));

    let result = Failure::host("sign", "key", &"unusable").into_result();
    assert!(result.diagnostics_for_test().is_empty());
    assert!(result.error_for_test().contains("\"kind\":\"key\""));
}

#[test]
fn the_shield_passes_an_ordinary_outcome_through() {
    let outcome = shield_result(&mut || Ok(ShojikuResult::json("{}".into())));
    let Ok(result) = outcome else {
        panic!("an ordinary outcome should pass through");
    };
    assert_eq!(result.json_for_test(), "{}");
}

#[test]
fn the_shield_turns_a_panic_into_a_failure_instead_of_an_unwind() {
    // If this test's process survives, the shield did its job: an unwind
    // reaching a C caller is undefined behaviour, not a test failure.
    let outcome = shield_result(&mut || panic!("deliberate panic inside the boundary"));
    let Err(failure) = outcome else {
        panic!("a panic must not look like success");
    };
    assert_eq!(failure.status(), SHOJIKU_ERR_PANIC);
    assert!(failure
        .into_result()
        .error_for_test()
        .contains("deliberate panic inside the boundary"));
}

#[test]
fn the_accessor_shield_reports_a_panic_as_a_status() {
    assert_eq!(shield_status(&mut || SHOJIKU_OK), SHOJIKU_OK);
    assert_eq!(
        shield_status(&mut || panic!("deliberate accessor panic")),
        SHOJIKU_ERR_PANIC
    );
}

#[test]
fn a_panic_message_survives_in_both_payload_shapes_and_neither_leaks_raw() {
    // `panic!("literal")` carries a &str; a formatted panic carries a String.
    let literal = shield_result(&mut || panic!("a literal payload"));
    let Err(literal) = literal else {
        panic!("expected a failure");
    };
    assert!(literal
        .into_result()
        .error_for_test()
        .contains("a literal payload"));

    // The argument must be computed at RUNTIME. `panic!("a {} payload",
    // "formatted")` folds to a single literal, and the panic runtime then
    // takes the `&str` path — so a test written that way silently checks the
    // same branch twice and leaves the String one unproven.
    let word = String::from("formatted");
    let formatted = shield_result(&mut || panic!("a {word} payload"));
    let Err(formatted) = formatted else {
        panic!("expected a failure");
    };
    assert!(formatted
        .into_result()
        .error_for_test()
        .contains("a formatted payload"));
}

#[test]
fn a_payload_that_is_not_a_string_gets_a_fixed_message() {
    // `panic_any` with a non-string payload has nothing printable in it, and
    // rendering an unknown type into an error the caller sees is exactly the
    // kind of echo this boundary refuses.
    let outcome = shield_result(&mut || std::panic::panic_any(42_u8));
    let Err(failure) = outcome else {
        panic!("expected a failure");
    };
    assert!(failure
        .into_result()
        .error_for_test()
        .contains("a panic was caught at the library boundary"));
}
