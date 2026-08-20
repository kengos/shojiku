//! `shojiku-wasm` — the browser/Workers WASM host over the shared
//! `shojiku-authoring` surface. The Designer loads this through its
//! engine-transport injection point (decided: browser WASM preview).
//!
//! Two layers, deliberately separated for coverage and determinism:
//!
//! - The **pure core** ([`Session`] + [`WasmError`]) is plain Rust — source
//!   strings and injected bytes in, JSON strings and pixel bytes out — so the
//!   workspace's host gates (test / clippy / 100% coverage) exercise every
//!   line. It is a thin wrapper: all logic lives in `shojiku-authoring`.
//! - The **wasm-bindgen shim** ([`shim`], compiled ONLY for `wasm32`) is
//!   marshalling: JS strings/`Uint8Array` ↔ the pure core. It never runs on
//!   the host, so its glue stays out of the host coverage surface.
//!
//! Bytes-first, host-fetched: fonts, assets, and locale packs are NEVER
//! compiled in; the JS host fetches and injects them, and sha256 font
//! verification happens inside the engine (`FontStore::load_from_injected`).
//! Document problems come back as diagnostics; the surface throws only on host
//! API misuse (fonts not loaded, no locale, a non-finite scale, a page index
//! past the document, an uncapped raw all-pages request).

mod error;
mod formats;
mod render;
mod session;

#[cfg(target_arch = "wasm32")]
mod shim;

pub use error::WasmError;
pub use formats::parse_probes;
pub use render::{PageFormat, Pages, PdfOutcome, RenderOutcome};
pub use session::{FaceFile, Session};

/// The engine's capability + version JSON (`{ version, capabilities,
/// builtinLocales }`) — needs no inputs, so a GUI can gate features before any
/// template exists. Mirrors the CLI/MCP `capabilities` op exactly (the Result
/// is returned verbatim; serializing the static info never actually fails).
pub fn capabilities() -> Result<String, serde_json::Error> {
    shojiku_authoring::run_capabilities()
}

#[cfg(test)]
mod tests;
