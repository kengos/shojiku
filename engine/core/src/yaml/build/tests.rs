//! The visitors against input today's parser never hands them: a parser that
//! did would get a refusal that says what was expected, not a panic.

use super::key::Key;
use super::{Node, State};
use serde::de::DeserializeSeed;
use serde::de::value::{BytesDeserializer, Error as DeError};

#[test]
fn a_node_or_key_of_an_unread_type_is_refused_naming_what_was_expected() {
    let state = State::default();
    let node = Node {
        state: &state,
        depth: 0,
    };
    let err = node
        .deserialize(BytesDeserializer::<DeError>::new(b"x"))
        .expect_err("bytes are not a YAML value");
    assert!(err.to_string().contains("expected a YAML value"), "{err}");
    let seen = std::collections::HashSet::new();
    let err = Key {
        state: &state,
        seen: &seen,
    }
    .deserialize(BytesDeserializer::<DeError>::new(b"x"))
    .expect_err("bytes are not a key");
    assert!(err.to_string().contains("expected a string key"), "{err}");
}
