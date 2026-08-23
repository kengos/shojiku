//! The crate error type for parsing untrusted input artifacts.

use shojiku_diagnostics::{Diagnostic, DiagnosticCode, Echo};
use thiserror::Error;

/// Errors produced while parsing Shojiku input artifacts.
///
/// Every field that quotes the input back is an [`Echo`], not a `String`:
/// this type's whole job is to tell an author which key they mistyped, and
/// the key comes from a document nobody vetted. The serde failures keep the
/// message rather than the error value because nothing in the workspace
/// walks the source chain, and an [`Echo`] cannot smuggle an escape sequence
/// onto a terminal the way a raw `serde_yaml::Error` rendering can.
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
    /// `column` pinpoint the offending key — `serde_yaml::from_value`
    /// drops both, which is why one mistyped top-level key used to
    /// surface only as a flood of downstream binding errors. `message`
    /// is the English default rendering; the structured fields are kept
    /// separate so diagnostics can later map them into typed args
    /// without re-parsing the string.
    #[error("failed to parse {what} at `{path}`: {message}")]
    Located {
        what: &'static str,
        path: Echo,
        /// 1-based line, or 0 when the location is unavailable.
        line: usize,
        /// 1-based column, or 0 when the location is unavailable.
        column: usize,
        message: Echo,
    },
}

impl From<serde_yaml::Error> for CoreError {
    fn from(err: serde_yaml::Error) -> Self {
        CoreError::Parse(Echo::from(err.to_string()))
    }
}

impl From<serde_json::Error> for CoreError {
    fn from(err: serde_json::Error) -> Self {
        CoreError::Json(Echo::from(err.to_string()))
    }
}

impl CoreError {
    /// Builds a [`CoreError::Located`] from a `serde_path_to_error`
    /// failure, extracting the field path and the underlying YAML
    /// line/column. Attacker-controlled text (an unbounded unknown key
    /// name, a deeply nested path) is bounded by the [`Echo`] field type,
    /// so a hostile document cannot blow up the error message or repaint
    /// the terminal reading it.
    pub(crate) fn located(
        what: &'static str,
        err: serde_path_to_error::Error<serde_yaml::Error>,
    ) -> Self {
        let path = Echo::from(err.path().to_string());
        let inner = err.into_inner();
        let (line, column) = inner
            .location()
            .map(|loc| (loc.line(), loc.column()))
            .unwrap_or((0, 0));
        CoreError::Located {
            what,
            path,
            line,
            column,
            message: Echo::from(inner.to_string()),
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
                line,
                column,
                message,
            } => {
                let mut diag = Diagnostic::new(DiagnosticCode::ParseError)
                    .arg("what", *what)
                    .arg("path", path.as_str())
                    .arg("detail", message.as_str())
                    .with_path(path.as_str());
                if *line > 0 {
                    diag = diag.arg("line", *line);
                }
                if *column > 0 {
                    diag = diag.arg("column", *column);
                }
                diag
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
