//! Reads a document into a [`Value`], refusing what the door refuses at the
//! node that breaks the rule rather than in a walk afterwards.
//!
//! The parser drives `serde`'s data model and this module is the visitor, so
//! the checks run once, during the one read, and the parser appears only in
//! [`tree`]. A refusal is raised as the parser's own error (that is how a
//! visitor stops a read, and it is where the line/column comes from), and
//! its kind, message and path are kept beside it in [`State`]: the path is
//! gathered as the error unwinds through each enclosing collection, so it
//! costs nothing unless something is refused.

use super::error::{YamlError, YamlErrorKind};
use super::value::Value;
use super::{MAX_DEPTH, MAX_INPUT_BYTES};
use crate::parse::trail::Trail;
use key::Key;
use serde::de::{self, DeserializeSeed, Deserializer, EnumAccess, MapAccess, SeqAccess, Visitor};
use std::cell::RefCell;
use std::collections::HashSet;
use std::fmt;

/// A refusal raised during the read, with the path to it innermost first.
struct Refusal {
    kind: YamlErrorKind,
    message: String,
    segments: Vec<Segment>,
}

enum Segment {
    Key(String),
    Index(usize),
}

type State = RefCell<Option<Refusal>>;

/// Reads `input` into a checked tree.
#[expect(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "the door itself: the one place a document is read into a tree"
)]
pub(super) fn tree(input: &str) -> Result<Value, YamlError> {
    if input.len() > MAX_INPUT_BYTES {
        let message = format!(
            "the input is {} bytes, over the {MAX_INPUT_BYTES}-byte input cap",
            input.len()
        );
        return Err(YamlError::new(YamlErrorKind::TooLarge, message));
    }
    let state = State::default();
    let node = Node {
        state: &state,
        depth: 0,
    };
    node.deserialize(serde_yaml::Deserializer::from_str(input))
        .map_err(|err| match state.into_inner() {
            Some(refusal) => YamlError::new(refusal.kind, refusal.message)
                .at_path(spell(&refusal.segments))
                .located(&err),
            None => YamlError::new(YamlErrorKind::Syntax, err.to_string()).located(&err),
        })
}

/// The path, root first, in the spelling the typed read uses (`a.b[3].c`,
/// and `.` for the root itself).
fn spell(innermost_first: &[Segment]) -> String {
    let mut trail = Trail::default();
    for segment in innermost_first.iter().rev() {
        match segment {
            Segment::Key(key) => trail.push_key(key),
            Segment::Index(i) => trail.push_index(*i),
        }
    }
    let path = trail.spell();
    if path.is_empty() {
        ".".to_owned()
    } else {
        path
    }
}

/// Records a refusal and returns the error that stops the read.
fn refuse<E: de::Error>(state: &State, kind: YamlErrorKind, message: String) -> E {
    let error = E::custom(&message);
    *state.borrow_mut() = Some(Refusal {
        kind,
        message,
        segments: Vec::new(),
    });
    error
}

/// Adds the step an unwinding refusal passed through. A syntax error has no
/// refusal recorded and passes through untouched.
fn blame<E>(state: &State, segment: Segment, error: E) -> E {
    if let Some(refusal) = state.borrow_mut().as_mut() {
        refusal.segments.push(segment);
    }
    error
}

/// The visitor for one node, `depth` collections below the root.
#[derive(Clone, Copy)]
struct Node<'s> {
    state: &'s State,
    depth: usize,
}

impl<'s> Node<'s> {
    /// The visitor for a child of this node, which is a collection.
    fn enter<E: de::Error>(self) -> Result<Node<'s>, E> {
        if self.depth >= MAX_DEPTH {
            let message = format!("the document nests deeper than {MAX_DEPTH} levels");
            return Err(refuse(self.state, YamlErrorKind::TooDeep, message));
        }
        Ok(Node {
            state: self.state,
            depth: self.depth + 1,
        })
    }
}

impl<'de> DeserializeSeed<'de> for Node<'_> {
    type Value = Value;

    fn deserialize<D: Deserializer<'de>>(self, deserializer: D) -> Result<Value, D::Error> {
        deserializer.deserialize_any(self)
    }
}

impl<'de> Visitor<'de> for Node<'_> {
    type Value = Value;

    fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("a YAML value")
    }

    fn visit_unit<E: de::Error>(self) -> Result<Value, E> {
        Ok(Value::Null)
    }

    /// An empty document: the parser reports it as no value at all.
    fn visit_none<E: de::Error>(self) -> Result<Value, E> {
        Ok(Value::Null)
    }

    fn visit_bool<E: de::Error>(self, b: bool) -> Result<Value, E> {
        Ok(Value::Bool(b))
    }

    fn visit_i64<E: de::Error>(self, n: i64) -> Result<Value, E> {
        Ok(Value::Int(n))
    }

    fn visit_u64<E: de::Error>(self, n: u64) -> Result<Value, E> {
        Ok(i64::try_from(n).map_or(Value::UInt(n), Value::Int))
    }

    fn visit_i128<E: de::Error>(self, n: i128) -> Result<Value, E> {
        Err(refuse_range(self.state, n))
    }

    fn visit_u128<E: de::Error>(self, n: u128) -> Result<Value, E> {
        Err(refuse_range(self.state, n))
    }

    fn visit_f64<E: de::Error>(self, f: f64) -> Result<Value, E> {
        if f.is_finite() {
            return Ok(Value::Float(f));
        }
        let message = format!("the number `{f}` is not finite; NaN and infinity are not allowed");
        Err(refuse(self.state, YamlErrorKind::NonFinite, message))
    }

    fn visit_str<E: de::Error>(self, s: &str) -> Result<Value, E> {
        Ok(Value::String(s.to_owned()))
    }

    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Value, A::Error> {
        let child = self.enter()?;
        let mut items = Vec::new();
        loop {
            match seq.next_element_seed(child) {
                Ok(Some(item)) => items.push(item),
                Ok(None) => return Ok(Value::Sequence(items)),
                Err(e) => return Err(blame(self.state, Segment::Index(items.len()), e)),
            }
        }
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Value, A::Error> {
        let child = self.enter()?;
        let mut seen = HashSet::new();
        let mut entries = Vec::new();
        while let Some(key) = map.next_key_seed(Key { state: self.state })? {
            if !seen.insert(key.clone()) {
                let message = format!("the key `{key}` appears twice in one mapping");
                return Err(refuse(self.state, YamlErrorKind::DuplicateKey, message));
            }
            match map.next_value_seed(child) {
                Ok(value) => entries.push((key, value)),
                Err(e) => return Err(blame(self.state, Segment::Key(key), e)),
            }
        }
        Ok(Value::Mapping(entries))
    }

    fn visit_enum<A: EnumAccess<'de>>(self, _: A) -> Result<Value, A::Error> {
        Err(refuse_tag(self.state))
    }
}

/// An integer the parser read wider than 64 bits, which no number of the
/// engine holds.
fn refuse_range<E: de::Error>(state: &State, n: impl fmt::Display) -> E {
    let message = format!("the integer `{n}` is outside the 64-bit range");
    refuse(state, YamlErrorKind::OutOfRange, message)
}

fn refuse_tag<E: de::Error>(state: &State) -> E {
    let message = "local YAML tags (`!name`) are not supported".to_owned();
    refuse(state, YamlErrorKind::Tag, message)
}

mod key;
#[cfg(test)]
mod tests;
