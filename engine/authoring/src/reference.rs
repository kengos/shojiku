//! `reference` — the key catalog: the machine-readable facts of the
//! authorable wire, held ONCE so every surface that describes a key renders
//! the same source.
//!
//! **Format is JSON Schema, derived from the parser.** Not a bespoke shape:
//! an agent reads a JSON Schema document correctly because it is imitating a
//! format it has seen constantly, and the properties that make that work —
//! node-local prose, closed enumeration so absence is information,
//! constraints in machine form, named `$ref` shapes, `oneOf` with a
//! discriminator for a tagged union — are the ones being copied. The product
//! has made this choice twice already: MCP `inputSchema` is JSON Schema, and
//! `definitions.yml` is the OpenAPI-shaped schema for the data half.
//!
//! **The artifact is committed and embedded; the GENERATOR is feature-gated.**
//! [`CATALOG`] is `include_str!`-ed, so a host serving it needs no root path
//! and a reference URI can never become a filesystem path. Generation needs
//! the schema derive, which lives behind the non-default `schema` feature —
//! a default build and the WASM bundle link none of it.
//!
//! What is NOT here is prose. Node-local `description` is the annotation
//! layer's job — authored per locale and merged at generation time — and it
//! is a separate stage. This one delivers the structure and the gate that
//! keeps it honest.

/// Where the committed artifact lives. A compile-time constant rooted at
/// `CARGO_MANIFEST_DIR`, so no caller-supplied value can steer a write.
pub const CATALOG_PATH: &str =
    concat!(env!("CARGO_MANIFEST_DIR"), "/reference/catalog.schema.json");

/// The committed catalog document.
pub const CATALOG: &str = include_str!("../reference/catalog.schema.json");

#[cfg(feature = "schema")]
mod generate;

#[cfg(feature = "schema")]
pub use generate::generate;

#[cfg(test)]
mod tests;
