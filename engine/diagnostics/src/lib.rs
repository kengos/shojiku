//! Structured diagnostics shared across the Shojiku engine.
//!
//! Everything the engine wants to tell a human, a GUI, or an AI about a
//! template/params combination flows through [`Diagnostic`] values:
//! validation errors, missing data keys, layout overflow warnings, etc.
//!
//! A diagnostic is built from a closed [`DiagnosticCode`] (the stable
//! contract key) plus typed [`ArgValue`] arguments; its `message` is the
//! English rendering of the code's template filled with those args. The
//! engine **never translates** — a localizing consumer keys its own catalog
//! off `code` and formats from `args`. Six orthogonal fields separate the
//! concerns: `code` (stable identity), `category` (re-categorizable domain),
//! `args` (typed interpolation data), `message` (English default), `path`
//! (where in the DOCUMENT), and `origin` (where in the ENGINE — non-contract,
//! free to churn, safe to strip).

mod arg;
mod category;
mod code;
mod echo;
mod render;

pub use arg::ArgValue;
pub use category::Category;
pub use code::DiagnosticCode;
pub use echo::{sanitize, sanitize_marked, Echo, MAX_ECHO, MAX_MESSAGE};

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;

/// How severe a diagnostic is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    /// The operation cannot produce a correct result.
    Error,
    /// The operation can continue but the output may not match intent.
    Warning,
    /// Purely informational.
    Info,
}

impl Serialize for DiagnosticCode {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for DiagnosticCode {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        DiagnosticCode::from_wire(&s)
            .ok_or_else(|| serde::de::Error::custom(format!("unknown diagnostic code `{s}`")))
    }
}

impl fmt::Display for DiagnosticCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

// Ergonomic comparison against the wire string, so call sites and tests can
// write `diag.code == "unknown_data_key"` without importing the enum.
impl PartialEq<&str> for DiagnosticCode {
    fn eq(&self, other: &&str) -> bool {
        self.as_str() == *other
    }
}

impl PartialEq<DiagnosticCode> for &str {
    fn eq(&self, other: &DiagnosticCode) -> bool {
        *self == other.as_str()
    }
}

/// One diagnostic message with a machine-readable code and typed args.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Diagnostic {
    pub severity: Severity,
    /// Stable machine-readable code, e.g. [`DiagnosticCode::UnknownDataKey`].
    pub code: DiagnosticCode,
    /// Semantic domain; re-categorizable, not part of the frozen contract.
    pub category: Category,
    /// English rendering of `code`'s template filled with `args`.
    pub message: String,
    /// Where in the template/params this happened, e.g. `sections.body.items[2]`.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub path: Option<String>,
    /// Typed interpolation data; a translating consumer renders from these.
    #[serde(skip_serializing_if = "BTreeMap::is_empty", default)]
    pub args: BTreeMap<String, ArgValue>,
    /// Engine source location (`file:line`) that emitted this — non-contract,
    /// churns freely, and may be stripped in untrusted output.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub origin: Option<String>,
}

impl Diagnostic {
    /// Starts a diagnostic for `code`; severity, category, and the initial
    /// (un-argued) message come from the registry, and `origin` is captured
    /// from the call site.
    #[track_caller]
    #[must_use]
    pub fn new(code: DiagnosticCode) -> Self {
        let loc = std::panic::Location::caller();
        Self {
            severity: code.severity(),
            code,
            category: code.category(),
            message: code.template().to_string(),
            path: None,
            args: BTreeMap::new(),
            origin: Some(format!("{}:{}", loc.file(), loc.line())),
        }
    }

    /// Adds a typed argument and re-renders the message from the template.
    #[must_use]
    pub fn arg(mut self, key: impl Into<String>, value: impl Into<ArgValue>) -> Self {
        self.args.insert(key.into(), value.into());
        self.message = render::render(self.code.template(), &self.args);
        self
    }

    /// Attaches a location path to the diagnostic.
    #[must_use]
    pub fn with_path(mut self, path: impl Into<String>) -> Self {
        self.path = Some(path.into());
        self
    }
}

impl fmt::Display for Diagnostic {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let sev = match self.severity {
            Severity::Error => "error",
            Severity::Warning => "warning",
            Severity::Info => "info",
        };
        write!(f, "{sev}[{}] {}", self.code, self.message)?;
        if let Some(path) = &self.path {
            write!(f, " (at {path})")?;
        }
        Ok(())
    }
}

/// An ordered collection of diagnostics.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Diagnostics {
    pub items: Vec<Diagnostic>,
}

impl Diagnostics {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, diagnostic: Diagnostic) {
        self.items.push(diagnostic);
    }

    /// Fills in the location of diagnostics pushed since `from` that carry
    /// none, leaving any that already named their own location untouched.
    ///
    /// This is how a walk gives its diagnostics an address without every
    /// emit site knowing where it is: the walk notes [`len`](Self::len)
    /// on entering a node and calls this on leaving it. Inner nodes leave
    /// first, so the DEEPEST enclosing node wins and outer ones skip what
    /// is already stamped. `from` past the end is a no-op, so a stale
    /// index can never panic.
    pub fn set_missing_paths(&mut self, from: usize, path: &str) {
        for diagnostic in self.items.iter_mut().skip(from) {
            if diagnostic.path.is_none() {
                diagnostic.path = Some(path.to_string());
            }
        }
    }

    pub fn extend(&mut self, other: Diagnostics) {
        self.items.extend(other.items);
    }

    /// Collapses genuinely duplicate diagnostics — the same warning
    /// re-emitted for one item across a measure and a render pass, or a
    /// per-child width resolved twice — keeping the first occurrence and the
    /// original order. Identity is `(code, path, message)`: the rendered
    /// message stands in for the args, so two warnings sharing a code and a
    /// (possibly absent) path but differing in a typed arg — e.g. one
    /// `unknown_font_family` per family name — stay distinct.
    /// `origin` is never part of the identity.
    pub fn dedup(&mut self) {
        let mut seen = std::collections::HashSet::new();
        self.items
            .retain(|d| seen.insert((d.code, d.path.clone(), d.message.clone())));
    }

    pub fn has_errors(&self) -> bool {
        self.items.iter().any(|d| d.severity == Severity::Error)
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn iter(&self) -> impl Iterator<Item = &Diagnostic> {
        self.items.iter()
    }
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
