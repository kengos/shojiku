//! The crate error type for parsing untrusted input artifacts.

use shojiku_diagnostics::{Diagnostic, DiagnosticCode};
use thiserror::Error;

/// Errors produced while parsing Shojiku input artifacts.
#[derive(Debug, Error)]
pub enum CoreError {
    #[error("failed to parse YAML/JSON: {0}")]
    Parse(#[from] serde_yaml::Error),
    #[error("failed to parse JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0} contains non-finite numbers (NaN/Infinity), which are not allowed")]
    NonFinite(&'static str),
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
        path: String,
        /// 1-based line, or 0 when the location is unavailable.
        line: usize,
        /// 1-based column, or 0 when the location is unavailable.
        column: usize,
        message: String,
    },
}

impl CoreError {
    /// Builds a [`CoreError::Located`] from a `serde_path_to_error`
    /// failure, extracting the field path and the underlying YAML
    /// line/column. Attacker-controlled text (an unbounded unknown key
    /// name, a deeply nested path) is clipped so a hostile document
    /// cannot blow up the error message.
    pub(crate) fn located(
        what: &'static str,
        err: serde_path_to_error::Error<serde_yaml::Error>,
    ) -> Self {
        let path = clip(&err.path().to_string());
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
            message: clip(&inner.to_string()),
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
                    .arg("path", path.clone())
                    .arg("detail", message.clone())
                    .with_path(path.clone());
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
            CoreError::Parse(err) => Diagnostic::new(DiagnosticCode::ParseError)
                .arg("what", "input")
                .arg("path", "")
                .arg("detail", err.to_string()),
            CoreError::Json(err) => Diagnostic::new(DiagnosticCode::ParseError)
                .arg("what", "input")
                .arg("path", "")
                .arg("detail", err.to_string()),
        }
    }
}

/// Bounds a possibly attacker-controlled string echoed into an error.
fn clip(text: &str) -> String {
    const MAX_CHARS: usize = 200;
    if text.chars().count() <= MAX_CHARS {
        text.to_string()
    } else {
        let head: String = text.chars().take(MAX_CHARS).collect();
        format!("{head}…")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn located_maps_to_parse_error_with_location_args() {
        let err = CoreError::Located {
            what: "template",
            path: "sections.body".to_string(),
            line: 3,
            column: 5,
            message: "unknown field `foo`".to_string(),
        };
        let diag = err.to_diagnostic();
        assert_eq!(diag.code, "parse_error");
        assert_eq!(diag.path.as_deref(), Some("sections.body"));
        assert_eq!(diag.args.get("line"), Some(&3usize.into()));
        assert_eq!(diag.args.get("column"), Some(&5usize.into()));
        assert!(diag.message.contains("unknown field `foo`"));
    }

    #[test]
    fn located_without_location_omits_line_and_column() {
        let err = CoreError::Located {
            what: "template",
            path: "root".to_string(),
            line: 0,
            column: 0,
            message: "bad".to_string(),
        };
        let diag = err.to_diagnostic();
        assert!(!diag.args.contains_key("line"));
        assert!(!diag.args.contains_key("column"));
    }

    #[test]
    fn non_finite_maps_to_its_own_code() {
        let diag = CoreError::NonFinite("params").to_diagnostic();
        assert_eq!(diag.code, "non_finite_number");
        assert!(diag.message.contains("params"));
    }

    #[test]
    fn structural_yaml_and_json_errors_degrade_to_parse_error() {
        let yaml = serde_yaml::from_str::<i32>("[unterminated").unwrap_err();
        let diag = CoreError::Parse(yaml).to_diagnostic();
        assert_eq!(diag.code, "parse_error");
        assert!(diag.args.contains_key("detail"));

        let json = serde_json::from_str::<i32>("{").unwrap_err();
        let diag = CoreError::Json(json).to_diagnostic();
        assert_eq!(diag.code, "parse_error");
    }
}
