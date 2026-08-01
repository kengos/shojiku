//! Unit tests for how failures surface.

use super::*;

#[test]
fn a_der_failure_with_nothing_more_specific_to_say_becomes_a_malformed_error() {
    // The one conversion the crate leans on for DER operations whose failure
    // adds nothing a caller could act on. Pinned directly because it is the
    // contract behind every `?` that has no message of its own.
    let error = der::Error::from(der::ErrorKind::Failed);
    assert_eq!(
        VerifyError::from(error),
        VerifyError::Malformed {
            what: "a DER structure this release can read"
        }
    );
}

#[test]
fn every_message_is_a_fixed_string_with_no_room_for_hostile_content() {
    // Structural rather than stylistic: none of these variants can hold a
    // `String` taken from the input, so this pins the shapes they DO print.
    let cases = [
        VerifyError::NoSignature,
        VerifyError::Unsupported { what: "a thing" },
        VerifyError::Malformed { what: "a thing" },
        VerifyError::LimitExceeded {
            what: "things",
            cap: 7,
        },
        VerifyError::NoTrustAnchors,
        VerifyError::AnchorNotPem,
    ];
    for case in cases {
        let message = case.to_string();
        assert!(message.is_ascii() && !message.is_empty(), "{message}");
    }
    assert_eq!(
        VerifyError::LimitExceeded {
            what: "things",
            cap: 7
        }
        .to_string(),
        "limit exceeded while reading the signature: things (cap 7)"
    );
}
