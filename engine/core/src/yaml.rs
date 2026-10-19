//! The one door YAML (and JSON, a subset of it) enters the engine through.
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
//! - a non-finite number (`.nan`, `.inf`), which poisons every geometry
//!   computation and which `serde_json` would silently turn into `null`, and
//!   an integer the parser reads as wider than 64 bits (today's reads one up
//!   to 128 bits as an integer; a wider one passes, as a float while it fits
//!   an `f64` and as a string past that);
//! - a local YAML tag (`!name`), which no wire format of the engine uses.
//!   The standard tags (`!!str`) are the parser's to resolve, so whether
//!   one is read is a fact about the parser, which the swap must re-check;
//!   a value its standard tag cannot be read as (`!!int abc`) is the
//!   parser's refusal, reported as [`YamlErrorKind::Syntax`].
//!
//! [`Value`] is the engine's own tree rather than the parser's, and it is
//! built through `serde`'s data model, so the walks over a document are
//! written against a type that outlives the parser and the parser shows up
//! in one call. A typed read goes through [`Document::typed`], which reads
//! the SOURCE again (the parser's own scalar rules, and its line/column) and
//! reports the field path of a structural failure; [`from_value`] reads a
//! subtree, with the path but without a location.
//!
//! Alias expansion is NOT bounded here beyond what the parser does, so a
//! document inside the input cap can still expand to a tree far larger than
//! itself.

use serde::de::DeserializeOwned;

/// How many collections deep a document may nest, counting the outermost.
///
/// It sits below the 128 levels today's parser refuses past, so this bound,
/// not the parser's, is the one that decides; a parser without a limit of its
/// own then changes nothing about which documents are read.
pub const MAX_DEPTH: usize = 120;

pub use crate::yaml_guard::MAX_INPUT_BYTES;
pub use error::{YamlError, YamlErrorKind};
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

/// [`parse`], then [`Document::typed`].
pub fn from_str<T: DeserializeOwned>(input: &str) -> Result<T, YamlError> {
    parse(input)?.typed()
}

/// Reads a tree (or a subtree) into `T`. A failure carries the field path
/// below `value`; there is no line/column, since a tree has no source.
pub fn from_value<T: DeserializeOwned>(value: &Value) -> Result<T, YamlError> {
    read::from_value(value)
}

mod build;
mod error;
mod read;
#[cfg(test)]
mod tests;
mod value;
