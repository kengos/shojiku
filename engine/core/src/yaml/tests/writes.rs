//! Writes through the door, and reading what was written back.

use crate::yaml::{YamlErrorKind, from_str, to_string};
use serde::{Deserialize, Serialize, Serializer};

#[derive(Debug, Deserialize, PartialEq, Serialize)]
struct Entry {
    name: String,
    size: u32,
}

#[test]
fn a_written_value_reads_back_as_itself() {
    let entry = Entry {
        name: "a".to_owned(),
        size: 3,
    };
    let text = to_string(&entry).expect("writes");
    assert_eq!(text, "name: a\nsize: 3\n");
    assert_eq!(from_str::<Entry>(&text).expect("reads"), entry);
}

/// A value whose `Serialize` refuses.
struct Refusing;

impl Serialize for Refusing {
    fn serialize<S: Serializer>(&self, _: S) -> Result<S::Ok, S::Error> {
        Err(serde::ser::Error::custom("not writable"))
    }
}

#[test]
fn a_value_that_refuses_to_serialize_is_a_write_error() {
    let err = to_string(&Refusing).expect_err("refused");
    assert_eq!(err.kind, YamlErrorKind::Write);
    assert_eq!(err.message.to_string(), "not writable");
}
