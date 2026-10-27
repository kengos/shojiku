//! Typed reads: from a document's source, and from a [`Value`] subtree.
//!
//! The source read is the parser's, so a scalar is read by the parser's own
//! rules for the field it lands in (`text: 2024` is the string `"2024"`),
//! and the error carries its line/column. The subtree read is this module's
//! `Deserializer` over [`Value`], which is strict the way a tree is: a scalar
//! is the type it was read as. A `null` where a list or a mapping (a struct
//! included) is wanted reads as an empty one, as the read it replaced did —
//! a locale overlay clears a table that way. Its error keeps what `serde`
//! failed on as a [`Fault`](super::fault::Fault), beside the message.

use super::error::{YamlError, YamlErrorKind};
use super::fault::{self, TreeError};
use super::parser;
use super::value::Value;
use serde::de::value::{MapAccessDeserializer, MapDeserializer, SeqDeserializer};
use serde::de::{DeserializeOwned, Deserializer, Error as _, IntoDeserializer, Visitor};
use std::cell::Cell;

pub(super) fn typed<T: DeserializeOwned>(source: &str) -> Result<T, YamlError> {
    // The path of a structural failure, kept aside: the parser's error
    // type is what the read hands back.
    let path = Cell::new(None);
    parser::read(source, |de| {
        serde_path_to_error::deserialize(de).map_err(|err| {
            path.set(Some(err.path().to_string()));
            err.into_inner()
        })
    })
    .map_err(|err| {
        // Every structural failure has a path; one past the read has none.
        // The message leads with it below the root, as a one-string error
        // shows it.
        let path = path.take();
        let message = match path.as_deref() {
            Some(at) if at != "." => format!("{at}: {err}"),
            _ => err.to_string(),
        };
        YamlError::new(YamlErrorKind::Shape, message)
            .with_fault(fault::of_parser(&err))
            .located(&err)
            .at_path_if(path)
    })
}

pub(super) fn from_value<T: DeserializeOwned>(value: &Value) -> Result<T, YamlError> {
    serde_path_to_error::deserialize(value).map_err(|err| {
        let path = err.path().to_string();
        let inner = err.into_inner();
        YamlError::new(YamlErrorKind::Shape, inner.message)
            .at_path(path)
            .with_fault(Some(inner.fault))
    })
}

fn entries(
    entries: &[(String, Value)],
) -> MapDeserializer<'_, impl Iterator<Item = (&str, &Value)>, TreeError> {
    MapDeserializer::new(entries.iter().map(|(key, value)| (key.as_str(), value)))
}

impl<'de> Deserializer<'de> for &'de Value {
    type Error = TreeError;

    fn deserialize_any<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, TreeError> {
        match self {
            Value::Null => visitor.visit_unit(),
            Value::Bool(b) => visitor.visit_bool(*b),
            Value::Int(n) => visitor.visit_i64(*n),
            Value::UInt(n) => visitor.visit_u64(*n),
            Value::Float(f) => visitor.visit_f64(*f),
            Value::String(s) => visitor.visit_borrowed_str(s),
            Value::Sequence(items) => {
                let mut seq = SeqDeserializer::new(items.iter());
                let value = visitor.visit_seq(&mut seq)?;
                seq.end()?;
                Ok(value)
            }
            Value::Mapping(pairs) => {
                let mut map = entries(pairs);
                let value = visitor.visit_map(&mut map)?;
                map.end()?;
                Ok(value)
            }
        }
    }

    fn deserialize_option<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, TreeError> {
        match self {
            Value::Null => visitor.visit_none(),
            _ => visitor.visit_some(self),
        }
    }

    /// A unit variant is its name; any other variant is a mapping with the
    /// name as its one key.
    fn deserialize_enum<V: Visitor<'de>>(
        self,
        _name: &'static str,
        _variants: &'static [&'static str],
        visitor: V,
    ) -> Result<V::Value, TreeError> {
        match self {
            Value::String(s) => visitor.visit_enum(s.as_str().into_deserializer()),
            Value::Mapping(pairs) if pairs.len() == 1 => {
                visitor.visit_enum(MapAccessDeserializer::new(entries(pairs)))
            }
            _ => Err(TreeError::custom(
                "expected a variant name, or a mapping with the variant name as its one key",
            )),
        }
    }

    fn deserialize_seq<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, TreeError> {
        match self {
            Value::Null => visitor.visit_seq(SeqDeserializer::new(std::iter::empty::<&Value>())),
            _ => self.deserialize_any(visitor),
        }
    }

    fn deserialize_tuple<V: Visitor<'de>>(
        self,
        _len: usize,
        visitor: V,
    ) -> Result<V::Value, TreeError> {
        self.deserialize_seq(visitor)
    }

    fn deserialize_tuple_struct<V: Visitor<'de>>(
        self,
        _name: &'static str,
        _len: usize,
        visitor: V,
    ) -> Result<V::Value, TreeError> {
        self.deserialize_seq(visitor)
    }

    fn deserialize_map<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, TreeError> {
        match self {
            Value::Null => visitor.visit_map(entries(&[])),
            _ => self.deserialize_any(visitor),
        }
    }

    fn deserialize_struct<V: Visitor<'de>>(
        self,
        _name: &'static str,
        _fields: &'static [&'static str],
        visitor: V,
    ) -> Result<V::Value, TreeError> {
        self.deserialize_map(visitor)
    }

    fn deserialize_newtype_struct<V: Visitor<'de>>(
        self,
        _name: &'static str,
        visitor: V,
    ) -> Result<V::Value, TreeError> {
        visitor.visit_newtype_struct(self)
    }

    serde::forward_to_deserialize_any! {
        bool i8 i16 i32 i64 i128 u8 u16 u32 u64 u128 f32 f64 char str string
        bytes byte_buf unit unit_struct identifier ignored_any
    }
}

impl<'de> IntoDeserializer<'de, TreeError> for &'de Value {
    type Deserializer = Self;

    fn into_deserializer(self) -> Self {
        self
    }
}
