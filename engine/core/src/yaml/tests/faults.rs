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
    (
        *err.fault.expect("a tree read keeps its fault"),
        err.message.to_string(),
    )
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
            Fault::UnknownField {
                field: "bogus".to_owned(),
                expected: vec!["name"],
            },
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
            Fault::UnknownVariant {
                variant: "Other".to_owned(),
                expected: vec!["Only"],
            },
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
    assert_eq!(
        fault,
        Fault::UnknownField {
            field: "name`, x".to_owned(),
            expected: vec!["name"],
        }
    );
}

/// A number whose own `Deserialize` refuses an odd one, by message.
#[derive(Debug, Deserialize)]
#[serde(try_from = "u8")]
struct Even;

impl TryFrom<u8> for Even {
    type Error = String;

    fn try_from(n: u8) -> Result<Self, String> {
        if n.is_multiple_of(2) {
            Ok(Even)
        } else {
            Err(format!("{n} is odd"))
        }
    }
}

/// The fault `T` fails with when read from the source `yaml`.
fn from_source<T: DeserializeOwned + std::fmt::Debug>(yaml: &str) -> Option<Fault> {
    from_str::<T>(yaml)
        .expect_err("must fail")
        .fault
        .map(|f| *f)
}

/// The shapes above behind an internally tagged enum, which serde buffers
/// and re-reads the way it does a template item — the read whose failures
/// the template parse compares.
#[derive(Debug, Deserialize)]
#[serde(tag = "t")]
enum Tagged {
    Entry(#[expect(dead_code, reason = "read only to make serde check it")] Entry),
    Small(#[expect(dead_code, reason = "read only to make serde check it")] Small),
    Pair {
        #[expect(dead_code, reason = "read only to make serde check it")]
        p: [u8; 2],
    },
    Kind {
        #[expect(dead_code, reason = "read only to make serde check it")]
        k: Kind,
    },
    Even {
        #[expect(dead_code, reason = "read only to make serde check it")]
        e: Even,
    },
}

#[test]
fn a_read_from_the_source_keeps_the_fault_a_read_from_the_tree_does() {
    // The parser words these its own way; what serde failed on is kept as
    // it is, so the two reads of one item compare equal.
    for doc in [
        "{ t: Entry, name: a, bogus: 1 }",
        "{ t: Entry }",
        "{ t: Entry, name: [ 1 ] }",
        "{ t: Small, n: 300 }",
        "{ t: Pair, p: [ 1 ] }",
        "{ t: Kind, k: Other }",
        "{ t: Even, e: 3 }",
    ] {
        let (tree, message) = failure::<Tagged>(&tree(doc));
        assert_eq!(from_source::<Tagged>(doc), Some(tree), "{doc}: {message}");
    }
}

#[test]
fn a_failure_of_the_parser_s_own_carries_no_fault() {
    #[derive(Debug, Deserialize)]
    struct Letter {
        #[expect(dead_code, reason = "read only to make serde check it")]
        c: char,
    }
    // A `char` is one character; the parser refuses more, in its own words.
    assert_eq!(from_source::<Letter>("c: ab\n"), None);
}

#[test]
fn the_tree_s_own_error_displays_as_serde_words_it() {
    // Read through `&Value`'s `Deserializer` directly, as a Rust caller can.
    let err = Entry::deserialize(&tree("{ name: a, bogus: 1 }")).expect_err("unknown field");
    assert_eq!(err.to_string(), "unknown field `bogus`, expected `name`");
}
