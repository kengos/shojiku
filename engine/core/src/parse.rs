//! Two-pass typed parse shared by the template and definitions entry points.
//!
//! Pass 1 parses to a `serde_yaml::Value`, rejects non-finite numbers
//! (the single choke point untrusted documents pass through — see
//! [`crate::yaml_guard`]) and applies the caller's nesting [`Bound`]: the
//! typed parse recurses far deeper per level than the `Value` did, so how
//! deep it may go is decided here, on the tree already in hand, rather than
//! discovered by running out of stack. Pass 2 deserializes the typed model straight
//! from the source string through `serde_path_to_error`, so a structural
//! error (unknown key, wrong type, bad enum variant) carries the field
//! PATH and the YAML line/column. `serde_yaml::from_value` drops both,
//! which is why a mistyped top-level key used to surface only as a flood
//! of downstream binding errors instead of one located parse error.
//!
//! Internally-tagged enums: `serde` buffers the content of a
//! `#[serde(tag = "type")]` enum (the template's `Body` and `Item`) into an
//! intermediate value and re-deserializes it, so an error INSIDE a body item
//! truncates the path to the enum boundary (`sections.body`) and its
//! line/column point at the buffered container's start, not the offending
//! key. For a TEMPLATE, [`locate`] then walks the raw document to the item
//! that fails on its own and reports ITS path — with the rejected top-level
//! key as a typed field when the failure is that key being unknown — and drops the
//! misleading line/column. The serde MESSAGE still names the bad key and
//! lists the expected fields (so `key:` on a table column reports
//! `unknown field \`key\`, expected … \`data\``), and plain-struct inputs
//! (definitions, top-level template keys) keep full path + accurate location.

use crate::error::CoreError;
use serde::de::DeserializeOwned;

/// A check over the pass-1 `Value`, run before the typed parse reads it.
pub(crate) type Bound = fn(&serde_yaml::Value) -> Result<(), CoreError>;

/// Parses `input` into `T`, refusing an oversize input unread, rejecting
/// non-finite numbers next, then applying `bound` to the pass-1 tree, and
/// returning a located [`CoreError`] on any structural failure. The size
/// check sits ahead of BOTH parses — this function reads the source twice,
/// so a bound applied afterwards would already have paid the cost it exists
/// to avoid — and `bound` sits ahead of the typed one for the same reason:
/// it is where an input whose typed parse would recurse too deeply is
/// refused (see [`nesting`] and `definitions`' schema depth).
pub(crate) fn parse_checked<T: DeserializeOwned>(
    input: &str,
    what: &'static str,
    bound: Bound,
) -> Result<T, CoreError> {
    parse_with(input, what, bound, |_, _| None)
}

/// [`parse_checked`] for a template, whose items are the tagged enum the
/// module doc warns about: their nesting is bounded first (see [`nesting`]),
/// and an in-item failure is re-located to the item that raised it (see
/// [`locate`]).
pub(crate) fn parse_template_checked<T: DeserializeOwned>(input: &str) -> Result<T, CoreError> {
    parse_with(input, "template", nesting::template, locate::item_fault)
}

fn parse_with<T: DeserializeOwned>(
    input: &str,
    what: &'static str,
    bound: Bound,
    fault: fn(&serde_yaml::Value, &str) -> Option<locate::ItemFault>,
) -> Result<T, CoreError> {
    crate::yaml_guard::ensure_bounded_size(input, what)?;
    let raw: serde_yaml::Value = serde_yaml::from_str(input)?;
    crate::yaml_guard::ensure_finite(&raw, what)?;
    bound(&raw)?;
    let de = serde_yaml::Deserializer::from_str(input);
    serde_path_to_error::deserialize(de).map_err(|err| {
        let found = fault(&raw, &err.inner().to_string());
        CoreError::located(what, err, found)
    })
}

pub(crate) mod locate;
mod nesting;
#[cfg(test)]
mod tests;
