//! Two-pass typed parse shared by the template and definitions entry points.
//!
//! Pass 1 reads the document through the YAML door ([`crate::yaml`]), which
//! refuses what every door refuses (size, depth, a non-string or duplicate
//! key, a non-finite or too-wide number, a local tag), and then applies the
//! caller's nesting [`Bound`] to the tree: the typed parse recurses far
//! deeper per level than the tree did, so how deep it may go is decided
//! here, on the tree already in hand, rather than discovered by running out
//! of stack. Pass 2 is the door's typed read of the source, so a structural
//! error (unknown key, wrong type, bad enum variant) carries the field PATH
//! and the YAML line/column.
//!
//! Internally-tagged enums: `serde` buffers the content of a
//! `#[serde(tag = "type")]` enum (the template's `Body` and `Item`) into an
//! intermediate value and re-deserializes it, so an error INSIDE a body item
//! truncates the path to the enum boundary (`sections.body`) and its
//! line/column point at the buffered container's start, not the offending
//! key. For a TEMPLATE, [`locate`] then walks the tree to the item that
//! fails on its own and reports ITS path — with the rejected top-level key
//! as a typed field when the failure is that key being unknown — and drops
//! the misleading line/column. The serde MESSAGE still names the bad key and
//! lists the expected fields (so `key:` on a table column reports
//! `unknown field \`key\`, expected … \`data\``), and plain-struct inputs
//! (definitions, top-level template keys) keep full path + accurate location.

use crate::error::CoreError;
use crate::yaml::{self, Document, Value};
use serde::de::DeserializeOwned;

/// A check over the pass-1 tree, run before the typed parse reads it.
pub(crate) type Bound = fn(&Value) -> Result<(), CoreError>;

/// Reads `input` through the YAML door, as the `what` door's error.
pub(crate) fn read<'a>(input: &'a str, what: &'static str) -> Result<Document<'a>, CoreError> {
    yaml::parse(input).map_err(|err| CoreError::from_yaml(what, input.len(), err))
}

/// Applies `bound` to `doc`'s tree, then reads it into `T`, returning a
/// located [`CoreError`] on any structural failure. `bound` sits ahead of
/// the typed read: it is where an input whose typed parse would recurse too
/// deeply is refused (see [`nesting`] and `definitions`' schema depth).
pub(crate) fn typed<T: DeserializeOwned>(
    doc: &Document<'_>,
    what: &'static str,
    bound: Bound,
) -> Result<T, CoreError> {
    typed_with(doc, what, bound, |_, _| None)
}

/// [`read`], then [`typed`], for a template, whose items are the tagged enum the
/// module doc warns about: their nesting is bounded first (see [`nesting`]),
/// and an in-item failure is re-located to the item that raised it (see
/// [`locate`]).
pub(crate) fn parse_template_checked<T: DeserializeOwned>(input: &str) -> Result<T, CoreError> {
    let doc = read(input, "template")?;
    typed_with(&doc, "template", nesting::template, locate::item_fault)
}

fn typed_with<T: DeserializeOwned>(
    doc: &Document<'_>,
    what: &'static str,
    bound: Bound,
    fault: fn(&Value, &str) -> Option<locate::ItemFault>,
) -> Result<T, CoreError> {
    bound(doc.tree())?;
    doc.typed()
        .map_err(|err| match fault(doc.tree(), &err.full) {
            Some(found) => CoreError::in_item(what, err, found),
            // A typed read is never refused for size, so no byte count is read.
            None => CoreError::from_yaml(what, 0, err),
        })
}

pub(crate) mod locate;
mod nesting;
#[cfg(test)]
mod tests;
pub(crate) mod trail;
