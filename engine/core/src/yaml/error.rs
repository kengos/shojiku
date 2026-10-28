//! What the YAML door reports when it refuses a document, or cannot write
//! a value out.

use super::fault::Fault;
use shojiku_diagnostics::Echo;
use thiserror::Error;

/// Why the door refused a document, or could not write a value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum YamlErrorKind {
    /// Over [`super::MAX_INPUT_BYTES`]; nothing was read.
    TooLarge,
    /// Refused by the parser itself: not well-formed YAML, a value its
    /// standard tag cannot be read as (`!!int abc`), or aliases replaying
    /// more than [`super::MAX_ALIAS_EVENTS`] events.
    Syntax,
    /// Nested deeper than [`super::MAX_DEPTH`].
    TooDeep,
    /// A mapping key that is not a string.
    NonStringKey,
    /// The same key twice in one mapping.
    DuplicateKey,
    /// A NaN or infinite number.
    NonFinite,
    /// A local YAML tag (`!name`). The standard tags (`!!str`, `!!int`, …)
    /// are the parser's to resolve and are read as the scalar they name.
    Tag,
    /// Well-formed, but not the shape the typed read expects.
    Shape,
    /// A value [`super::to_string`] could not write: one whose `Serialize`
    /// reports an error, or a shape YAML cannot hold.
    Write,
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
    /// What a typed read failed on, for comparing two failures without
    /// matching their text (the template parse compares it with the same
    /// node read again from the tree). `None` for every other error, so two errors alike in
    /// every shown field still differ when only one came from a typed read.
    /// Boxed: it is rare, and the error is returned by value everywhere.
    pub(crate) fault: Option<Box<Fault>>,
}

impl YamlError {
    /// The message with where it happened, for a door whose error is one
    /// string. A typed read's message already names its field and the
    /// parser's line/column, and a syntax error its line/column, so those
    /// are returned as they are; any other refusal gains its path and, when
    /// known, its line/column — after the message, so a long path is what
    /// a bounded rendering clips, not the reason.
    pub fn located_message(&self) -> String {
        if self.kind == YamlErrorKind::Syntax
            || (self.kind == YamlErrorKind::Shape && self.line > 0)
        {
            return self.message.to_string();
        }
        let mut text = self.message.to_string();
        if let Some(path) = &self.path {
            text.push_str(&format!(" at `{path}`"));
        }
        if self.line > 0 {
            text.push_str(&format!(", line {} column {}", self.line, self.column));
        }
        text
    }

    pub(super) fn new(kind: YamlErrorKind, message: impl AsRef<str>) -> Self {
        YamlError {
            kind,
            path: None,
            line: 0,
            column: 0,
            message: Echo::from(message.as_ref()),
            fault: None,
        }
    }

    pub(super) fn with_fault(mut self, fault: Option<Fault>) -> Self {
        self.fault = fault.map(Box::new);
        self
    }

    /// A refusal the parser made on its own: a local tag, or anything else
    /// (not well-formed, a standard tag it cannot read, the alias bound).
    /// `path` spells where the read stopped, for the refusal that sits at a
    /// node (a tag); a syntax error is located by line/column alone.
    #[expect(
        clippy::disallowed_types,
        reason = "the door itself: the parser's error is classified here"
    )]
    pub(super) fn from_parser(err: &serde_saphyr::Error, path: impl FnOnce() -> String) -> Self {
        let error = match err.without_snippet() {
            serde_saphyr::Error::UnsupportedTag { .. } => YamlError::new(
                YamlErrorKind::Tag,
                "local YAML tags (`!name`) are not supported",
            )
            .at_path(path()),
            _ => YamlError::new(YamlErrorKind::Syntax, err.to_string()),
        };
        error.located(err)
    }

    pub(super) fn at_path(mut self, path: String) -> Self {
        self.path = Some(Echo::from(path));
        self
    }

    pub(super) fn at_path_if(mut self, path: Option<String>) -> Self {
        self.path = path.map(Echo::from);
        self
    }

    /// Takes the parser's location, when it has one.
    #[expect(
        clippy::disallowed_types,
        reason = "the door itself: the parser's error is read for its location here"
    )]
    pub(super) fn located(mut self, err: &serde_saphyr::Error) -> Self {
        if let Some(loc) = err.location() {
            self.line = usize::try_from(loc.line()).unwrap_or(usize::MAX);
            self.column = usize::try_from(loc.column()).unwrap_or(usize::MAX);
        }
        self
    }
}
