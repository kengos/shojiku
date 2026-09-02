//! The code→severity map, and the one place it is assembled.
//!
//! The `Severity` column of a rendered table has to say the same word a real
//! diagnostic says in its JSON, so the map is built from `DiagnosticCode::ALL`
//! rather than authored in [`super::super::TABLES`]. It lives here, alone,
//! for the reason [`super::super::pages::Known::of_this_build`] gives for the
//! vocabulary: the drift test and `reference-gen` must audit against the SAME
//! inputs, and two hand-built copies would drift with nobody running the one
//! that mattered. Both callers had their own copy before this module existed.
//!
//! The severity WORD comes from a match rather than from `serde_json`, so
//! there is no fallible step to `expect` on in library code. The match is
//! exhaustive, so a new `Severity` variant is a compile error here; that it
//! still spells what serde spells is [`tests`]' job, not a runtime check.

use super::Registry;
use shojiku_diagnostics::{DiagnosticCode, Severity};

/// The wire spelling of a severity — the `snake_case` serde emits.
const fn word(severity: Severity) -> &'static str {
    match severity {
        Severity::Error => "error",
        Severity::Warning => "warning",
        Severity::Info => "info",
    }
}

/// Every code the engine can emit, paired with the wire spelling of its
/// default severity.
#[must_use]
pub fn registry() -> Registry {
    DiagnosticCode::ALL
        .iter()
        .map(|code| (code.as_str().to_owned(), word(code.severity()).to_owned()))
        .collect()
}

#[cfg(test)]
mod tests;
