//! The tree a YAML document is read into, owned by the engine rather than by
//! the parser.

use serde::ser::{Serialize, SerializeMap, SerializeSeq, Serializer};

/// One node of a document that passed [`super::parse`].
///
/// In a tree [`super::parse`] returned, a [`Value::Float`] is finite, a
/// mapping's keys are distinct, and nothing nests deeper than
/// [`super::MAX_DEPTH`]. The variants are public, so a tree built by hand
/// holds none of that. A mapping keeps its entries in document order.
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    /// An integer that fits an `i64`.
    Int(i64),
    /// An integer above `i64::MAX`.
    UInt(u64),
    /// Any other number: one written with a fraction or an exponent (`1.0`
    /// is one) and, as today's parser reads it, an integer past 128 bits
    /// that still fits an `f64` (a wider one it reads as a string).
    Float(f64),
    String(String),
    Sequence(Vec<Value>),
    Mapping(Vec<(String, Value)>),
}

impl Value {
    /// The value under `key`, when this is a mapping holding it.
    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            Value::Mapping(entries) => entries
                .iter()
                .find_map(|(name, value)| (name == key).then_some(value)),
            _ => None,
        }
    }
}

/// Writes the tree back out through `serde`, so it converts to another
/// format's tree (`serde_json::to_value`) without a second parser.
impl Serialize for Value {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Value::Null => serializer.serialize_unit(),
            Value::Bool(b) => serializer.serialize_bool(*b),
            Value::Int(n) => serializer.serialize_i64(*n),
            Value::UInt(n) => serializer.serialize_u64(*n),
            Value::Float(f) => serializer.serialize_f64(*f),
            Value::String(s) => serializer.serialize_str(s),
            Value::Sequence(items) => {
                let mut seq = serializer.serialize_seq(Some(items.len()))?;
                for item in items {
                    seq.serialize_element(item)?;
                }
                seq.end()
            }
            Value::Mapping(entries) => {
                let mut map = serializer.serialize_map(Some(entries.len()))?;
                for (key, value) in entries {
                    map.serialize_entry(key, value)?;
                }
                map.end()
            }
        }
    }
}
