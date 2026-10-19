//! The visitor for a mapping key: a string is the key, anything else is
//! refused as the key of the mapping that holds it.

use super::{refuse, refuse_tag, State};
use crate::yaml::error::YamlErrorKind;
use serde::de::{self, DeserializeSeed, Deserializer, EnumAccess, MapAccess, SeqAccess, Visitor};
use std::fmt;

/// The key visitor of one mapping.
pub(super) struct Key<'s> {
    pub(super) state: &'s State,
}

impl Key<'_> {
    /// Refuses the key, named by `what` — a scalar is quoted back, a
    /// collection only named by kind, since its content is unbounded.
    fn refuse<E: de::Error>(self, what: String) -> E {
        let message = format!(
            "mapping key {what} is not a string; every key must be one (quote it if it is a name)"
        );
        refuse(self.state, YamlErrorKind::NonStringKey, message)
    }
}

impl<'de> DeserializeSeed<'de> for Key<'_> {
    type Value = String;

    fn deserialize<D: Deserializer<'de>>(self, deserializer: D) -> Result<String, D::Error> {
        deserializer.deserialize_any(self)
    }
}

impl<'de> Visitor<'de> for Key<'_> {
    type Value = String;

    fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("a string key")
    }

    fn visit_str<E: de::Error>(self, s: &str) -> Result<String, E> {
        Ok(s.to_owned())
    }

    fn visit_unit<E: de::Error>(self) -> Result<String, E> {
        Err(self.refuse("`null`".to_owned()))
    }

    fn visit_bool<E: de::Error>(self, b: bool) -> Result<String, E> {
        Err(self.refuse(format!("`{b}`")))
    }

    fn visit_i64<E: de::Error>(self, n: i64) -> Result<String, E> {
        Err(self.refuse(format!("`{n}`")))
    }

    fn visit_u64<E: de::Error>(self, n: u64) -> Result<String, E> {
        Err(self.refuse(format!("`{n}`")))
    }

    fn visit_i128<E: de::Error>(self, n: i128) -> Result<String, E> {
        Err(self.refuse(format!("`{n}`")))
    }

    fn visit_u128<E: de::Error>(self, n: u128) -> Result<String, E> {
        Err(self.refuse(format!("`{n}`")))
    }

    fn visit_f64<E: de::Error>(self, f: f64) -> Result<String, E> {
        Err(self.refuse(format!("`{f}`")))
    }

    fn visit_seq<A: SeqAccess<'de>>(self, _: A) -> Result<String, A::Error> {
        Err(self.refuse("a sequence".to_owned()))
    }

    fn visit_map<A: MapAccess<'de>>(self, _: A) -> Result<String, A::Error> {
        Err(self.refuse("a mapping".to_owned()))
    }

    fn visit_enum<A: EnumAccess<'de>>(self, _: A) -> Result<String, A::Error> {
        Err(refuse_tag(self.state))
    }
}
