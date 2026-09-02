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
//! **Prose is authored beside the schema, not lifted from it.** schemars would
//! fill `description` from Rust doc comments for free, and taking the free
//! version would have defeated the completeness gate before it was written —
//! every node would arrive pre-annotated with engine-developer text nobody
//! wrote for an author, in a register no second locale can carry. Generation
//! strips them and merges [`ANNOTATIONS`] instead, and
//! [`annotations::audit`] is what says the result is complete.

/// Where the committed artifact lives. A compile-time constant rooted at
/// `CARGO_MANIFEST_DIR`, so no caller-supplied value can steer a write.
pub const CATALOG_PATH: &str =
    concat!(env!("CARGO_MANIFEST_DIR"), "/reference/catalog.schema.json");

/// The committed catalog document.
pub const CATALOG: &str = include_str!("../reference/catalog.schema.json");

/// The English annotation layer: the per-key prose merged into [`CATALOG`] as
/// node-local `description` at generation time.
///
/// English only, and hard-wired rather than looked up: the engine serves
/// English and does not translate, so a localized reference is the site's to
/// render. The file sits in its own directory so a second locale is a file
/// rather than a mechanism.
pub const ANNOTATIONS: &str = include_str!("../reference/annotations/en.yml");

pub mod annotations;

/// The generated reference tables' editorial half: which of a node's keys each
/// page's table shows, how its rows group, and what its columns say. Authored
/// because it cannot be derived, and held to the catalog by
/// [`tables::audit`].
pub const TABLES: &str = include_str!("../reference/tables.yml");

pub mod tables;

/// The rule for the tables and prose the pages still write THEMSELVES.
///
/// [`tables`] can only hold what a spec assembles. Twenty-two pages carry a
/// hand-written `Code` table under `## Diagnostics`, and a twenty-third states
/// its codes as prose — none of which any spec renders. This is what holds
/// those claims to `DiagnosticCode`, the capability list and the catalog.
pub mod pages;

#[cfg(feature = "schema")]
mod annotate;

#[cfg(feature = "schema")]
mod generate;

#[cfg(feature = "schema")]
pub use generate::generate;

/// What `reference-gen` does, as a function rather than as a `main`.
///
/// The binary is a wiring line over [`run::run`]; the audit-before-write
/// ordering and the write-nothing-on-refusal rule live there, where a test can
/// drive them over a fixture tree.
#[cfg(feature = "schema")]
pub mod run;

#[cfg(test)]
mod tests;
