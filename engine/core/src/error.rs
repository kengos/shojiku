//! The crate error type for parsing untrusted input artifacts.

use crate::parse::locate::ItemFault;
use crate::yaml::{MAX_INPUT_BYTES, YamlError, YamlErrorKind};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode, Echo};
use thiserror::Error;

/// Errors produced while parsing Shojiku input artifacts.
///
/// Every field that quotes the input back is an [`Echo`], not a `String`:
/// this type's whole job is to tell an author which key they mistyped, and
/// the key comes from a document nobody vetted. The serde failures keep the
/// message rather than the error value because nothing in the workspace
/// walks the source chain, and an [`Echo`] cannot smuggle an escape sequence
/// onto a terminal the way a raw parser error's rendering can.
#[derive(Debug, Error)]
pub enum CoreError {
    #[error("failed to parse YAML/JSON: {0}")]
    Parse(Echo),
    #[error("failed to parse JSON: {0}")]
    Json(Echo),
    #[error("{0} contains non-finite numbers (NaN/Infinity), which are not allowed")]
    NonFinite(&'static str),
    /// The input was refused unread for its SIZE. Both fields are numbers
    /// by construction — a refusal must not quote back a document nobody
    /// vetted, and at this point nothing about it has been parsed anyway.
    #[error("{what} is {bytes} bytes, over the {limit}-byte input cap")]
    TooLarge {
        what: &'static str,
        bytes: usize,
        limit: usize,
    },
    /// A structural parse failure located to a field path. `path`
    /// (`sections.body.items[3].columns[0]`) plus the 1-based `line`/
    /// `column` pinpoint the offending key — a read of the pass-1 tree
    /// (`yaml::from_value`) would drop the location, and reading without
    /// the path is why one mistyped top-level key used to surface only as
    /// a flood of downstream binding errors. `message`
    /// is the English default rendering; the structured fields are kept
    /// separate so diagnostics can later map them into typed args
    /// without re-parsing the string.
    ///
    /// A failure inside a template ITEM is located to the item itself
    /// (`sections.body.items[0]`): the tagged-enum buffering loses the path
    /// inside it, so `line`/`column` are 0 there, and `key` names the item's
    /// own top-level key when the failure is that key being unknown (checked:
    /// the item without it no longer complains) — the one fact a tool needs
    /// to remove it.
    #[error("failed to parse {what} at `{path}`: {message}")]
    Located {
        what: &'static str,
        path: Echo,
        /// The item's rejected top-level key, for an unknown key on an item.
        key: Option<Echo>,
        /// 1-based line, or 0 when the location is unavailable.
        line: usize,
        /// 1-based column, or 0 when the location is unavailable.
        column: usize,
        message: Echo,
    },
    /// A template whose items nest deeper than
    /// [`crate::template::MAX_CONTAINER_DEPTH`], refused on the pass-1 tree
    /// before the typed parse reads it. It is validation's
    /// `container_depth_exceeded`, raised earlier: the path names the same
    /// holder (the item, or the table column) that validation would.
    #[error("template containers nest deeper than {max} levels at `{path}`")]
    ContainerDepth { path: Echo, max: usize },
}

impl From<serde_json::Error> for CoreError {
    fn from(err: serde_json::Error) -> Self {
        CoreError::Json(Echo::from(err.to_string()))
    }
}

impl CoreError {
    /// The error a parse door returns for a refusal of the YAML door
    /// ([`crate::yaml`]), reading a `what` of `bytes` bytes. A refusal the
    /// door locates (a key, a duplicate, the depth, a number, a tag, or a
    /// typed read's field) is [`CoreError::Located`] with the door's path and
    /// line/column; the root is spelled `.`. Attacker-controlled text (an
    /// unbounded key name, a deep path) is already bounded by the [`Echo`]
    /// fields the door hands over.
    pub(crate) fn from_yaml(what: &'static str, bytes: usize, err: YamlError) -> Self {
        match err.kind {
            YamlErrorKind::TooLarge => CoreError::TooLarge {
                what,
                bytes,
                limit: MAX_INPUT_BYTES,
            },
            YamlErrorKind::Syntax => CoreError::Parse(err.message),
            YamlErrorKind::NonFinite => CoreError::NonFinite(what),
            _ => CoreError::Located {
                what,
                path: err.path.unwrap_or(Echo::from(".")),
                key: None,
                line: err.line,
                column: err.column,
                message: err.message,
            },
        }
    }

    /// A typed-read failure re-located to the template item that raised it
    /// ([`ItemFault`]): the item's path replaces the truncated one, and the
    /// door's location, which points at the enclosing enum, is dropped.
    pub(crate) fn in_item(what: &'static str, err: YamlError, fault: ItemFault) -> Self {
        CoreError::Located {
            what,
            path: Echo::from(fault.path),
            key: fault.key.map(Echo::from),
            line: 0,
            column: 0,
            message: err.message,
        }
    }

    /// Renders this parse failure as a structured diagnostic so a GUI can
    /// show it inline like any other. A [`CoreError::Located`] maps its
    /// field path + line/column into typed args; `line`/`column` are
    /// omitted when unknown (0) so the diagnostic never over-promises an
    /// exact location for an item-internal (tagged-enum) error. Structural
    /// YAML/JSON failures with no location degrade to a `detail`-only args
    /// set.
    pub fn to_diagnostic(&self) -> Diagnostic {
        match self {
            CoreError::Located {
                what,
                path,
                key,
                line,
                column,
                message,
            } => {
                let mut diag = Diagnostic::new(DiagnosticCode::ParseError)
                    .arg("what", *what)
                    .arg("path", path.as_str())
                    .arg("detail", message.as_str())
                    .with_path(path.as_str());
                if let Some(key) = key {
                    diag = diag.arg("key", key.as_str());
                }
                if *line > 0 {
                    diag = diag.arg("line", *line);
                }
                if *column > 0 {
                    diag = diag.arg("column", *column);
                }
                diag
            }
            CoreError::ContainerDepth { path, max } => {
                Diagnostic::new(DiagnosticCode::ContainerDepthExceeded)
                    .arg("max", *max)
                    .with_path(path.as_str())
            }
            CoreError::NonFinite(what) => {
                Diagnostic::new(DiagnosticCode::NonFiniteNumber).arg("what", *what)
            }
            // A refused-for-size input never became a document, so this is
            // the same class as any other parse refusal and takes the same
            // code — no new one is minted for it. `detail` carries the two
            // numbers and nothing from the input.
            CoreError::TooLarge { what, bytes, limit } => {
                Diagnostic::new(DiagnosticCode::ParseError)
                    .arg("what", *what)
                    .arg("path", "")
                    .arg(
                        "detail",
                        format!("{bytes} bytes, over the {limit}-byte cap"),
                    )
            }
            CoreError::Parse(detail) | CoreError::Json(detail) => {
                Diagnostic::new(DiagnosticCode::ParseError)
                    .arg("what", "input")
                    .arg("path", "")
                    .arg("detail", detail.as_str())
            }
        }
    }
}

#[cfg(test)]
#[path = "error/tests.rs"]
mod tests;
