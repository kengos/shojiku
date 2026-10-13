//! The pattern probe's input side: which types a probe may name, how a host's
//! raw `(type name, pattern)` pair becomes a [`PatternProbe`], and the one
//! count cap.
//!
//! Every host (CLI, MCP, wasm) receives probes in its own shape — a
//! `<type>:<pattern>` string, a JSON object — but the RULES are one set: only
//! `date` and `datetime` carry a pattern form, and a request past
//! [`MAX_PROBES`] is refused whole. They live here so a host marshals and maps
//! a [`ProbeError`] into its own envelope, and cannot grow a policy of its own.

use super::MAX_PROBES;
use shojiku_core::FieldType;
use shojiku_diagnostics::sanitize;

/// The longest type name echoed back in a refusal, in characters.
const MAX_ECHOED_NAME: usize = 40;

/// The field types that carry a pattern form. Every other type has none, so
/// accepting one would answer a question the wire cannot be asked.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProbeType {
    Date,
    Datetime,
}

impl ProbeType {
    /// The type for a wire spelling; `None` for anything but `date` and
    /// `datetime` (including the other, real, field types).
    #[must_use]
    pub fn from_name(name: &str) -> Option<Self> {
        match FieldType::from_name(name)? {
            FieldType::Date => Some(Self::Date),
            FieldType::Datetime => Some(Self::Datetime),
            _ => None,
        }
    }
}

/// A pattern the caller wants previewed before authoring it.
#[derive(Debug, Clone)]
pub struct PatternProbe {
    pub field_type: ProbeType,
    pub pattern: String,
}

/// Why a host's probe input was refused before the catalog ran.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ProbeError {
    /// The type name is not `date` or `datetime`. Carries the name already
    /// clipped and control-stripped — it is host-supplied and echoed.
    #[error("`{0}` has no pattern form; probe `date` or `datetime`")]
    NoPatternForm(String),
    /// More probes than [`MAX_PROBES`] were requested.
    #[error("{got} probes requested; at most {} are answered", MAX_PROBES)]
    TooMany { got: usize },
}

impl PatternProbe {
    /// A probe from a host's raw type name and pattern.
    ///
    /// The pattern is NOT length-checked here: an over-long one is answered in
    /// its own slot as `refused: patternTooLong`, which names which probe was
    /// too long where one flat error could not.
    ///
    /// # Errors
    /// [`ProbeError::NoPatternForm`] when `type_name` is not `date` or `datetime`.
    pub fn new(type_name: &str, pattern: impl Into<String>) -> Result<Self, ProbeError> {
        let field_type = ProbeType::from_name(type_name)
            .ok_or_else(|| ProbeError::NoPatternForm(sanitize(type_name, MAX_ECHOED_NAME)))?;
        Ok(Self {
            field_type,
            pattern: pattern.into(),
        })
    }
}

/// The one count policy: a request for more than [`MAX_PROBES`] is refused
/// whole, by every host, before any probe is parsed.
///
/// # Errors
/// [`ProbeError::TooMany`] when `count` exceeds the cap.
pub fn check_probe_count(count: usize) -> Result<(), ProbeError> {
    if count > MAX_PROBES {
        return Err(ProbeError::TooMany { got: count });
    }
    Ok(())
}
