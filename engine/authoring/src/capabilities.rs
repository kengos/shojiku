//! The engine's machine-readable capability list: what a GUI/SDK may
//! offer against *this* binary (feature gating across versions).
//!
//! A newer Designer talking to an older engine reads this instead of
//! discovering missing syntax through raw parse errors. Keys are
//! template-syntax-aligned: bare keys are item `type`s, dotted keys
//! namespace box/style/length features and output surfaces. **Every
//! change that widens the wire format, the accepted asset surface
//! (what SVG/raster content renders — an older engine silently drops
//! what it can't parse, so the GUI must gate previews), or an output
//! surface MUST append a key here in the same PR** (the
//! shojiku-architect skill's capability-gating check).

use serde::Serialize;

mod list;
pub use list::CAPABILITIES;

/// The `engine` block shared by `shojiku capabilities` and the `inspect`
/// envelope.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
    pub version: &'static str,
    pub capabilities: &'static [&'static str],
    /// Locale ids compiled into this build (`--lang` works without any
    /// pack file); a GUI locale picker gates on this list.
    pub builtin_locales: &'static [&'static str],
}

/// This build's engine info (version from the workspace package).
pub fn engine_info() -> EngineInfo {
    EngineInfo {
        version: env!("CARGO_PKG_VERSION"),
        capabilities: CAPABILITIES,
        builtin_locales: shojiku_formatter::BUILTIN_LOCALE_IDS,
    }
}

/// The `capabilities` JSON payload. Needs no inputs, so a GUI can gate
/// features before any template exists.
pub fn run_capabilities() -> Result<String, serde_json::Error> {
    serde_json::to_string_pretty(&engine_info())
}

#[cfg(test)]
mod tests;
