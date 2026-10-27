//! The visitor for a mapping key: a string is the key, unless the mapping
//! already holds it; anything else is refused as the key of the mapping
//! that holds it. Refused while the key is read, so the parser locates the
//! refusal at the key.

use super::{State, refuse};
use crate::yaml::error::YamlErrorKind;
use serde::de::{self, DeserializeSeed, Deserializer, MapAccess, SeqAccess, Visitor};
use std::collections::HashSet;
use std::fmt;

/// The key visitor of one mapping, which has read the keys in `seen`.
pub(super) struct Key<'s> {
    pub(super) state: &'s State,
    pub(super) seen: &'s HashSet<String>,
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
        if self.seen.contains(s) {
            let message = format!("the key `{s}` appears twice in one mapping");
            return Err(refuse(self.state, YamlErrorKind::DuplicateKey, message));
        }
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

    fn visit_f64<E: de::Error>(self, f: f64) -> Result<String, E> {
        Err(self.refuse(format!("`{f}`")))
    }

    fn visit_seq<A: SeqAccess<'de>>(self, _: A) -> Result<String, A::Error> {
        Err(self.refuse("a sequence".to_owned()))
    }

    fn visit_map<A: MapAccess<'de>>(self, _: A) -> Result<String, A::Error> {
        Err(self.refuse("a mapping".to_owned()))
    }
}
