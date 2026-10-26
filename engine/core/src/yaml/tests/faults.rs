//! What a typed read of a tree failed on: each kind serde reports arrives as
//! its [`Fault`], with serde's own wording as the message.

use crate::yaml::fault::Fault;
use crate::yaml::{Value, from_str, from_value, parse};
use serde::Deserialize;
use serde::de::DeserializeOwned;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Entry {
    #[expect(dead_code, reason = "read only to make serde check it")]
    name: String,
}

#[derive(Debug, Deserialize)]
struct Small {
    #[expect(dead_code, reason = "read only to make serde check it")]
    n: u8,
}

#[derive(Debug, Deserialize)]
enum Kind {
    Only,
}

/// The fault and the message `T` fails with on `tree`.
fn failure<T: DeserializeOwned + std::fmt::Debug>(tree: &Value) -> (Fault, String) {
    let err = from_value::<T>(tree).expect_err("must fail");
    (*err.fault.expect("a tree read keeps its fault"), err.full)
}

fn tree(yaml: &str) -> Value {
    parse(yaml).expect("well-formed").into_tree()
}

#[test]
fn every_kind_serde_reports_keeps_its_fault_and_its_wording() {
    let cases: [(Fault, String, &str); 7] = [
        {
            let (f, m) = failure::<Entry>(&tree("{ name: a, bogus: 1 }"));
            (f, m, "unknown field `bogus`, expected `name`")
        },
        {
            let (f, m) = failure::<Entry>(&tree("{}"));
            (f, m, "missing field `name`")
        },
        {
            let (f, m) = failure::<Entry>(&tree("{ name: 1 }"));
            (f, m, "invalid type: integer `1`, expected a string")
        },
        {
            let (f, m) = failure::<Small>(&tree("{ n: 300 }"));
            (f, m, "invalid value: integer `300`, expected u8")
        },
        {
            let (f, m) = failure::<[u8; 2]>(&tree("[ 1 ]"));
            (f, m, "invalid length 1, expected an array of length 2")
        },
        {
            let (f, m) = failure::<Kind>(&tree("Other"));
            (f, m, "unknown variant `Other`, expected `Only`")
        },
        {
            // A tree holds a duplicate only when built by hand: the door
            // refuses one in a document.
            let twice = |v: &str| (String::from("name"), Value::String(v.to_owned()));
            let (f, m) = failure::<Entry>(&Value::Mapping(vec![twice("a"), twice("b")]));
            (f, m, "duplicate field `name`")
        },
    ];
    for (_, message, wording) in &cases {
        assert_eq!(message, wording);
    }
    let faults: Vec<Fault> = cases.into_iter().map(|(f, ..)| f).collect();
    assert_eq!(
        faults,
        [
            Fault::UnknownField("bogus".to_owned()),
            Fault::MissingField("name".to_owned()),
            Fault::InvalidType {
                unexpected: "integer `1`".to_owned(),
                expected: "a string".to_owned(),
            },
            Fault::InvalidValue {
                unexpected: "integer `300`".to_owned(),
                expected: "u8".to_owned(),
            },
            Fault::InvalidLength {
                len: 1,
                expected: "an array of length 2".to_owned(),
            },
            Fault::UnknownVariant("Other".to_owned()),
            Fault::DuplicateField("name".to_owned()),
        ]
    );
}

#[test]
fn a_message_of_the_type_s_own_is_a_custom_fault() {
    // The tree's own refusal of a sequence where a variant is wanted.
    let (fault, message) = failure::<Kind>(&tree("[ Only ]"));
    assert_eq!(fault, Fault::Custom(message.clone()));
    assert!(message.starts_with("expected a variant name"), "{message}");
}

#[test]
fn an_unknown_field_is_named_as_the_document_spells_it() {
    // A key carrying serde's own quoting is one field, not a prefix of one.
    let (fault, _) = failure::<Entry>(&tree("{ name: a, \"name`, x\": 1 }"));
    assert_eq!(fault, Fault::UnknownField("name`, x".to_owned()));
}

#[test]
fn a_read_from_the_source_carries_no_fault() {
    let err = from_str::<Entry>("bogus: 1\n").expect_err("unknown field");
    assert_eq!(err.fault, None);
}

#[test]
fn the_tree_s_own_error_displays_as_serde_words_it() {
    // Read through `&Value`'s `Deserializer` directly, as a Rust caller can.
    let err = Entry::deserialize(&tree("{ name: a, bogus: 1 }")).expect_err("unknown field");
    assert_eq!(err.to_string(), "unknown field `bogus`, expected `name`");
}
