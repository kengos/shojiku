//! Two-pass typed parse shared by the template and definitions entry points.
//!
//! Pass 1 parses to a `serde_yaml::Value` and rejects non-finite numbers
//! (the single choke point untrusted documents pass through — see
//! [`crate::yaml_guard`]). Pass 2 deserializes the typed model straight
//! from the source string through `serde_path_to_error`, so a structural
//! error (unknown key, wrong type, bad enum variant) carries the field
//! PATH and the YAML line/column. `serde_yaml::from_value` drops both,
//! which is why a mistyped top-level key used to surface only as a flood
//! of downstream binding errors instead of one located parse error.
//!
//! Limitation — internally-tagged enums: `serde` buffers the content of a
//! `#[serde(tag = "type")]` enum (the template's `Body` and `Item`) into an
//! intermediate value and re-deserializes it, so an error INSIDE a body item
//! truncates the path to the enum boundary (`sections.body`) and its
//! line/column point at the buffered container's start, not the offending
//! key. The serde MESSAGE still names the bad key and lists the expected
//! fields (so `key:` on a table column reports `unknown field \`key\`,
//! expected … \`data\``), and plain-struct inputs (definitions, top-level
//! template keys) keep full path + accurate location.

use crate::error::CoreError;
use serde::de::DeserializeOwned;

/// Parses `input` into `T`, refusing an oversize input unread, rejecting
/// non-finite numbers next, and returning a located [`CoreError`] on any
/// structural failure. The size check sits ahead of BOTH parses — this
/// function reads the source twice, so a bound applied afterwards would
/// already have paid the cost it exists to avoid.
pub(crate) fn parse_checked<T: DeserializeOwned>(
    input: &str,
    what: &'static str,
) -> Result<T, CoreError> {
    crate::yaml_guard::ensure_bounded_size(input, what)?;
    let raw: serde_yaml::Value = serde_yaml::from_str(input)?;
    crate::yaml_guard::ensure_finite(&raw, what)?;
    let de = serde_yaml::Deserializer::from_str(input);
    serde_path_to_error::deserialize(de).map_err(|err| CoreError::located(what, err))
}

#[cfg(test)]
mod tests;
