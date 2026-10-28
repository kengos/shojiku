//! The tree read the way `serde` re-reads a buffered enum (its private
//! `ContentDeserializer`), where that differs from the door's own tree read:
//! a `null` is a unit value wherever it lands, so a list, a mapping or a
//! struct refuses it and only an `Option` takes it (as `None`); a unit, or a
//! unit variant's payload, takes an empty mapping, and a unit struct an
//! empty mapping or list; a non-negative integer is read as unsigned, so a
//! variant named by its index reads.
//!
//! The template parse follows a failure `serde` reported from inside a
//! buffered `Body` or `Item` (`crate::parse`'s locate) by reading the same
//! node again from the tree. The door's own tree read ([`super::from_value`])
//! reads a `null` list or mapping as an empty one, so it would pass where
//! `serde` failed and go on to a later failure of the same kind; read this
//! way, its first failure is `serde`'s. Where the two still differ, they
//! refuse in other words (e.g. an enum read from neither a name nor a
//! one-key mapping): the faults then differ, and the template parse stops
//! at the node it last confirmed.
//!
//! Every other hinted read (the scalars, `str`, `seq`, `map`, `struct`,
//! `identifier`) forwards to `deserialize_any`, so it calls the
//! visitor where `serde` refuses a kind the hint does not name without
//! calling it. The two agree only while every visitor refuses a kind its
//! hint does not name, as every one in the engine does today; a visitor
//! that takes, say, an integer through `deserialize_str` would read here
//! and fail there. [`trace`] keeps where a failure was as
//! `serde_path_to_error` segments rather than spelled.

use super::fault::{Fault, TreeError};
use super::value::Value;
use serde::de::value::{MapAccessDeserializer, MapDeserializer, SeqDeserializer};
use serde::de::{DeserializeOwned, Deserializer, Error as _, IntoDeserializer, Visitor};

/// A failed [`trace`]: what `serde` failed on, and where below the value read.
pub(crate) struct Traced {
    pub(crate) path: serde_path_to_error::Path,
    pub(crate) fault: Fault,
}

pub(super) fn trace<T: DeserializeOwned>(value: &Value) -> Result<T, Traced> {
    serde_path_to_error::deserialize(Strict(value)).map_err(|err| Traced {
        path: err.path().clone(),
        fault: err.into_inner().fault,
    })
}

/// A node read with `null` as a unit value.
#[derive(Clone, Copy)]
struct Strict<'de>(&'de Value);

fn entries(
    entries: &[(String, Value)],
) -> MapDeserializer<'_, impl Iterator<Item = (&str, Strict<'_>)>, TreeError> {
    MapDeserializer::new(
        entries
            .iter()
            .map(|(key, value)| (key.as_str(), Strict(value))),
    )
}

impl<'de> Deserializer<'de> for Strict<'de> {
    type Error = TreeError;

    fn deserialize_any<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, TreeError> {
        match self.0 {
            Value::Null => visitor.visit_unit(),
            Value::Bool(b) => visitor.visit_bool(*b),
            Value::Int(n) => match u64::try_from(*n) {
                Ok(n) => visitor.visit_u64(n),
                Err(_) => visitor.visit_i64(*n),
            },
            Value::UInt(n) => visitor.visit_u64(*n),
            Value::Float(f) => visitor.visit_f64(*f),
            Value::String(s) => visitor.visit_borrowed_str(s),
            Value::Sequence(items) => {
                let mut seq = SeqDeserializer::new(items.iter().map(Strict));
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
        match self.0 {
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
        match self.0 {
            Value::String(s) => visitor.visit_enum(s.as_str().into_deserializer()),
            Value::Mapping(pairs) if pairs.len() == 1 => {
                visitor.visit_enum(MapAccessDeserializer::new(entries(pairs)))
            }
            _ => Err(TreeError::custom(
                "expected a variant name, or a mapping with the variant name as its one key",
            )),
        }
    }

    fn deserialize_unit<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, TreeError> {
        match self.0 {
            Value::Mapping(pairs) if pairs.is_empty() => visitor.visit_unit(),
            _ => self.deserialize_any(visitor),
        }
    }

    fn deserialize_unit_struct<V: Visitor<'de>>(
        self,
        _name: &'static str,
        visitor: V,
    ) -> Result<V::Value, TreeError> {
        match self.0 {
            Value::Mapping(pairs) if pairs.is_empty() => visitor.visit_unit(),
            Value::Sequence(items) if items.is_empty() => visitor.visit_unit(),
            _ => self.deserialize_any(visitor),
        }
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
        bytes byte_buf seq tuple tuple_struct map struct
        identifier ignored_any
    }
}

impl<'de> IntoDeserializer<'de, TreeError> for Strict<'de> {
    type Deserializer = Self;

    fn into_deserializer(self) -> Self {
        self
    }
}
