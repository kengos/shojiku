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
use super::parser;
use super::value::Value;
use super::{MAX_DEPTH, MAX_INPUT_BYTES};
use crate::parse::trail::Trail;
use key::Key;
use serde::de::{self, DeserializeSeed, Deserializer, MapAccess, SeqAccess, Visitor};
use std::cell::RefCell;
use std::collections::HashSet;
use std::fmt;

/// What stopped the read: the door's own refusal, if it was one, and the
/// path to where the read stopped, innermost first, whoever stopped it.
#[derive(Default)]
struct Stop {
    refusal: Option<(YamlErrorKind, String)>,
    segments: Vec<Segment>,
}

enum Segment {
    Key(String),
    Index(usize),
}

type State = RefCell<Stop>;

/// Reads `input` into a checked tree.
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
    parser::read(input, |de| node.deserialize(de)).map_err(|err| {
        let stop = state.into_inner();
        match stop.refusal {
            Some((kind, message)) => YamlError::new(kind, message)
                .at_path(spell(&stop.segments))
                .located(&err),
            // The parser's own refusal of a local tag sits at a node too.
            None => YamlError::from_parser(&err, || spell(&stop.segments)),
        }
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
    state.borrow_mut().refusal = Some((kind, message));
    error
}

/// Adds the step an unwinding error passed through.
fn blame<E>(state: &State, segment: Segment, error: E) -> E {
    state.borrow_mut().segments.push(segment);
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

    /// `null`, `~`, an empty value, and an empty document.
    fn visit_unit<E: de::Error>(self) -> Result<Value, E> {
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
        let state = self.state;
        while let Some(key) = map.next_key_seed(Key { state, seen: &seen })? {
            seen.insert(key.clone());
            match map.next_value_seed(child) {
                Ok(value) => entries.push((key, value)),
                Err(e) => return Err(blame(self.state, Segment::Key(key), e)),
            }
        }
        Ok(Value::Mapping(entries))
    }
}

mod key;
#[cfg(test)]
mod tests;
