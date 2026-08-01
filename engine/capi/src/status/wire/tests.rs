//! Tests for the failure's wire shape and the shared encoder.

use super::*;
use serde_json::Value;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode, Diagnostics};

/// The three keys, parsed back out of a failure.
fn parts_of(failure: &Failure) -> (String, String, String) {
    let Ok(Value::Object(object)) = serde_json::from_str::<Value>(&failure.error_json()) else {
        panic!("error_json must be a JSON object");
    };
    let field = |key: &str| object[key].as_str().unwrap_or_default().to_string();
    (field("step"), field("kind"), field("message"))
}

#[test]
fn every_failure_renders_the_same_three_keys() {
    // One shape for both levels is the point: an SDK writes one mapping.
    let failures = [
        Failure::NullArg("out"),
        Failure::InvalidUtf8("request"),
        Failure::InvalidRequest("unknown field `templat`".into()),
        Failure::TooLarge {
            what: "pdf",
            len: 9,
            max: 4,
        },
        Failure::OutOfRange { index: 7, total: 2 },
        Failure::Panic("boom".into()),
        Failure::host("sign", "key", &"unusable key"),
        Failure::Document {
            step: "render",
            diagnostics: "{}".into(),
        },
    ];
    assert_eq!(failures.len(), 8, "every Failure variant is covered here");
    for failure in &failures {
        let (step, kind, message) = parts_of(failure);
        assert!(!step.is_empty(), "step must name a lifecycle stage");
        assert!(!kind.is_empty(), "kind must be machine-readable");
        assert!(!message.is_empty(), "message must say something");
    }
}

#[test]
fn each_variant_names_what_went_wrong() {
    assert_eq!(
        parts_of(&Failure::NullArg("out")),
        (
            "call".into(),
            "null_argument".into(),
            "`out` must not be null".into()
        )
    );
    assert_eq!(
        parts_of(&Failure::InvalidUtf8("request")).2,
        "`request` is not valid UTF-8"
    );
    assert_eq!(
        parts_of(&Failure::TooLarge {
            what: "pdf",
            len: 9,
            max: 4
        })
        .2,
        "`pdf` is 9 bytes, over the 4-byte cap"
    );
    assert_eq!(
        parts_of(&Failure::OutOfRange { index: 7, total: 2 }).2,
        "page index 7 is past the last page of 2"
    );
    assert_eq!(parts_of(&Failure::Panic("boom".into())).0, "panic");
    assert_eq!(
        parts_of(&Failure::host("sign", "key", &"unusable key")),
        ("sign".into(), "key".into(), "unusable key".into())
    );
    // A document failure points at the diagnostics rather than trying to
    // summarise them in prose.
    let document = parts_of(&Failure::Document {
        step: "render",
        diagnostics: "{}".into(),
    });
    assert_eq!(
        (document.0.as_str(), document.1.as_str()),
        ("render", "document")
    );
    assert!(document.2.contains("diagnostics"));
}

#[test]
fn an_echoed_message_is_stripped_of_control_characters() {
    // Engine errors quote caller-supplied content; a terminal-escape
    // injection through an error message is a real thing to refuse.
    let hostile = Failure::host("render", "parse", &"line one\n\u{1b}[31mred\u{7}");
    let (_, _, message) = parts_of(&hostile);
    assert_eq!(message, "line one[31mred");
}

#[test]
fn an_echoed_message_is_bounded() {
    let long = "x".repeat(MAX_MESSAGE * 3);
    let (_, _, message) = parts_of(&Failure::host("render", "parse", &long));
    assert_eq!(message.chars().count(), MAX_MESSAGE);
}

#[test]
fn clipping_counts_characters_not_bytes() {
    // A byte-based cap would cut a multi-byte character in half; the message
    // is UTF-8 on the wire, so this has to be character-based.
    let long = "領".repeat(MAX_MESSAGE + 10);
    assert_eq!(clip(&long).chars().count(), MAX_MESSAGE);
}

#[test]
fn encoding_a_serializable_value_produces_its_json() {
    let mut diagnostics = Diagnostics::new();
    diagnostics.push(Diagnostic::new(DiagnosticCode::ImageSourceMissing));
    let json = encode(&diagnostics);
    assert!(json.contains("image_source_missing"));

    let Ok(parsed) = serde_json::from_str::<Value>(&json) else {
        panic!("encode must produce parseable JSON");
    };
    assert_eq!(parsed["items"].as_array().map(Vec::len), Some(1));
}

#[test]
fn a_value_json_cannot_represent_encodes_as_null() {
    // Pinning WHY `encode` can promise a String: serde_json writes a
    // non-finite float as `null` rather than refusing it, which is the one
    // value that looked like it might need an error path.
    assert_eq!(encode(&f64::NAN), "null");
    assert_eq!(encode(&f64::INFINITY), "null");
}
