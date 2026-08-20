//! Authoring surface: the shared validate / prepare / preview / inspect /
//! capabilities layer that the CLI, the browser/Workers WASM bindings, and
//! the MCP server all wrap. One contract, no CLI-shaped second grammar.
//!
//! Bytes-first by construction: inputs are source strings, fonts/assets are
//! injectable bytes, and sha256 font verification happens INSIDE the engine
//! (the layout `FontStore`), so the core surface has no filesystem or
//! command-line dependency. Filesystem pack discovery (search dirs, overlay
//! files) for the FS hosts (CLI, MCP server) lives in the feature-gated
//! [`fs`] module (`fs`, default-on); bytes-injecting hosts (WASM) build with
//! `default-features = false`. Command wiring stays per host.
//!
//! The capability list (`CAPABILITIES` / [`EngineInfo`]) lives here so every
//! surface advertises one identical key set instead of each re-deriving it.

mod capabilities;
mod formats;
#[cfg(feature = "fs")]
pub mod fs;
mod inspect;
mod locale;
mod prepare;
mod preview;
pub mod reference;
mod sources;

#[cfg(test)]
mod test_support;

pub use capabilities::{engine_info, run_capabilities, EngineInfo, CAPABILITIES};
pub use formats::{
    format_catalog, FormatCatalog, FormatOrigin, FormatTypeEntry, FormatVariant, PatternProbe,
    ProbeRefusal, ProbeResult, MAX_PROBES, MAX_PROBE_PATTERN,
};
pub use inspect::{inspect_envelope, inspect_json, InspectEnvelope};
pub use locale::{load_pack, resolve_locale_id, valid_locale_id, LocaleError};
pub use prepare::{prepare, AssetsInput, PrepareCtx, Prepared};
pub use preview::{preview_page, preview_page_raw, preview_pages, preview_raw};

// The raw-preview page type rides the `preview_raw` return, re-exported so a
// host types against one surface.
pub use shojiku_render_png::RawPage;
pub use sources::{load_sources, validate_strings, Sources};

// Hosts injecting fonts import the pack shape from one place; the verified
// bytes-first constructor is `shojiku_layout::FontStore::load_from_injected`.
pub use shojiku_formatter::InjectedPack;
