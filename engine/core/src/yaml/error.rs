//! What the YAML door reports when it refuses a document.

use shojiku_diagnostics::Echo;
use thiserror::Error;

/// Why the door refused a document.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum YamlErrorKind {
    /// Over [`super::MAX_INPUT_BYTES`]; nothing was read.
    TooLarge,
    /// Refused by the parser itself: not well-formed YAML, or a value its
    /// standard tag cannot be read as (`!!int abc`).
    Syntax,
    /// Nested deeper than [`super::MAX_DEPTH`].
    TooDeep,
    /// A mapping key that is not a string.
    NonStringKey,
    /// The same key twice in one mapping.
    DuplicateKey,
    /// A NaN or infinite number.
    NonFinite,
    /// An integer the parser read as wider than 64 bits.
    OutOfRange,
    /// A local YAML tag (`!name`). The standard tags (`!!str`, `!!int`, …)
    /// are the parser's to resolve and are read as the scalar they name.
    Tag,
    /// Well-formed, but not the shape the typed read expects.
    Shape,
}

/// A refusal, located as far as the door can locate it.
///
/// Every text field is an [`Echo`]: a key or a path is the document's, which
/// nobody vetted.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
#[error("{message}")]
#[non_exhaustive]
pub struct YamlError {
    pub kind: YamlErrorKind,
    /// Where in the tree: the mapping holding a refused key, the node a
    /// refused value sits at, or the field a typed read failed on. `None`
    /// when the failure is not in the tree (a size refusal, a syntax error).
    /// The root is spelled `.`.
    pub path: Option<Echo>,
    /// 1-based line, or 0 when the location is unavailable.
    pub line: usize,
    /// 1-based column, or 0 when the location is unavailable.
    pub column: usize,
    pub message: Echo,
}

impl YamlError {
    pub(super) fn new(kind: YamlErrorKind, message: impl AsRef<str>) -> Self {
        YamlError {
            kind,
            path: None,
            line: 0,
            column: 0,
            message: Echo::from(message.as_ref()),
        }
    }

    pub(super) fn at_path(mut self, path: String) -> Self {
        self.path = Some(Echo::from(path));
        self
    }

    /// Takes the parser's location, when it has one.
    pub(super) fn located(mut self, err: &serde_yaml::Error) -> Self {
        if let Some(loc) = err.location() {
            self.line = loc.line();
            self.column = loc.column();
        }
        self
    }
}
