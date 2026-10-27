//! The one door YAML (and JSON, a subset of it) enters the engine through,
//! and the one it is written out through ([`to_string`]).
//!
//! Every refusal that does not depend on WHICH document a door reads is made
//! HERE, while the document is being read into a [`Value`], so that no
//! caller can forget one. (A door's own bounds — a template's `items:`
//! nesting, a definitions schema's depth — stay with the door.) What the
//! door refuses:
//!
//! - an input over [`MAX_INPUT_BYTES`], refused unread;
//! - a document nested deeper than [`MAX_DEPTH`] collections — counted here,
//!   so the bound does not depend on the parser having one of its own;
//! - a mapping key that is not a string. Every authored registry is keyed by
//!   name and the wire mirrors JSON, while `serde`'s buffering of a tagged
//!   enum can MISREAD an integer key as a field number;
//! - a duplicate key in one mapping;
//! - a non-finite number (`.nan`, `.inf`, and a number too large for an
//!   `f64`), which poisons every geometry computation and which `serde_json`
//!   would silently turn into `null`. An integer wider than 64 bits is read
//!   as a float;
//! - a local YAML tag (`!name`), which no wire format of the engine uses.
//!   The standard tags (`!!str`) are the parser's to resolve; a value its
//!   standard tag cannot be read as (`!!int abc`) is the parser's refusal,
//!   reported as [`YamlErrorKind::Syntax`];
//! - a document whose aliases replay more than [`MAX_ALIAS_EVENTS`] events
//!   in all, counted by the parser, reported as [`YamlErrorKind::Syntax`].
//!
//! [`Value`] is the engine's own tree rather than the parser's, and it is
//! built through `serde`'s data model, so the walks over a document are
//! written against a type that outlives the parser and the parser shows up
//! in one call. A typed read goes through [`Document::typed`], which reads
//! the SOURCE again (the parser's own scalar rules, and its line/column) and
//! reports the field path of a structural failure; [`from_value`] reads a
//! subtree, with the path but without a location.
//!
//! The scalar rules are the parser's (see `parser.rs` for its settings):
//! only `true` and `false` are booleans, a plain number is a number however
//! it is written (`0123` and `1_000` included), and `<<` is an ordinary key.
//! The Designer bounds aliases on the browser side with `MAX_ALIAS_COUNT`,
//! over a different YAML library that counts in its own unit.

use serde::Serialize;
use serde::de::DeserializeOwned;

/// How many collections deep a document may nest, counting the outermost.
///
/// Counted by the door itself, and the parser is set to refuse only a few
/// levels deeper, so this bound, with its path, is the one that decides.
pub const MAX_DEPTH: usize = 120;

/// The largest input the door reads, in bytes.
///
/// 16 MiB — twice the Designer's documented 8 MiB template ceiling, so no
/// legal document is anywhere near it, while a hostile one cannot make the
/// engine hold and walk an arbitrarily large tree. The MCP surface keeps
/// its own, much tighter inline cap (512 KiB) for its own reasons. A door
/// that reports the refusal in an error type of its own (the formatter's
/// `LangPackError::TooLarge`) compares against this one number.
pub const MAX_INPUT_BYTES: usize = 16 * 1024 * 1024;

/// How many events the aliases of one document may replay in all.
///
/// A fixed number rather than one that grows with the document, so a small
/// document cannot expand into a tree far larger than itself (the
/// "billion laughs"). One style of a few keys shared 500 times reads well
/// inside it.
pub const MAX_ALIAS_EVENTS: usize = 100_000;

pub use error::{YamlError, YamlErrorKind};
pub use fault::TreeError;
pub use value::Value;

/// A document that passed every check of this door: its tree, and the source
/// it was read from, which a typed read reads again.
#[derive(Debug)]
pub struct Document<'a> {
    source: &'a str,
    tree: Value,
}

impl<'a> Document<'a> {
    /// The document's tree.
    pub fn tree(&self) -> &Value {
        &self.tree
    }

    /// The document's tree, without the source.
    pub fn into_tree(self) -> Value {
        self.tree
    }

    /// Reads the document into `T`. A structural failure (an unknown key, a
    /// wrong type, a bad variant) carries the field path and the parser's
    /// line/column.
    pub fn typed<T: DeserializeOwned>(&self) -> Result<T, YamlError> {
        read::typed(self.source)
    }
}

/// Reads `input` through every check this door makes.
pub fn parse(input: &str) -> Result<Document<'_>, YamlError> {
    let tree = build::tree(input)?;
    Ok(Document {
        source: input,
        tree,
    })
}

/// The stack a document at [`MAX_DEPTH`] needs: what the door, and a typed
/// read after it, take there in a debug build, with some room. Tests that
/// read such a document run it on a thread of this size.
///
/// Measured: the tree read alone needs between 2.5 and 2.75 MiB at 121
/// levels, a template's typed read with 115 levels inside one item between
/// 2.5 and 3 MiB, and `parse_params` at 120 levels between 2 and 3 MiB. A
/// release build needs less (the Designer's real-wasm suite reads 119
/// levels on wasm's 1 MiB stack); a release native host is not measured.
pub const DEEP_DOCUMENT_STACK: usize = 4 << 20;

/// Runs `read` on a thread of [`DEEP_DOCUMENT_STACK`]. An overflow aborts
/// the whole test binary, so a regression is loud rather than a failed
/// assertion.
#[cfg(test)]
pub(crate) fn on_a_deep_document_stack<T: Send + 'static>(
    read: impl FnOnce() -> T + Send + 'static,
) -> T {
    std::thread::Builder::new()
        .stack_size(DEEP_DOCUMENT_STACK)
        .spawn(read)
        .expect("spawn")
        .join()
        .expect("no panic")
}

/// [`parse`], then [`Document::typed`].
pub fn from_str<T: DeserializeOwned>(input: &str) -> Result<T, YamlError> {
    parse(input)?.typed()
}

/// Writes `value` as a YAML document. The other half of the door: what the
/// engine writes is written by the parser crate it is read back with, so
/// replacing the parser replaces both in one place. A value is written as
/// its type serializes it, including what the read refuses on the way back
/// in: a non-finite float (written as `.nan` or `.inf`).
pub fn to_string<T: Serialize + ?Sized>(value: &T) -> Result<String, YamlError> {
    write::to_string(value)
}

/// Reads a tree (or a subtree) into `T`. A failure carries the field path
/// below `value`; there is no line/column, since a tree has no source.
pub fn from_value<T: DeserializeOwned>(value: &Value) -> Result<T, YamlError> {
    read::from_value(value)
}

mod build;
mod error;
pub(crate) mod fault;
mod parser;
mod read;
#[cfg(test)]
mod tests;
mod value;
mod write;
