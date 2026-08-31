//! `tables` — the reference's markdown tables: assembled from a spec, and
//! AUDITED against the parser and the diagnostic-code registry.
//!
//! The key catalog holds the FACTS of the wire ([`super::CATALOG`]) and the
//! annotation layer holds their prose ([`super::ANNOTATIONS`]). This module is
//! what renders them as the tables `docs/engine/*.md` shows a reader, so the
//! doc set stops being a fourth hand-maintained copy of the same data.
//!
//! **What is derived and what is authored, with the numbers.** Measured on the
//! committed spec: **81 of the 995 rendered cells take their value from the
//! engine, and all 81 are the `Severity` column on 4 of the 35 tables. On the
//! 28 key tables it is 0 of 648.** The cells are authored in
//! [`super::TABLES`]; do not describe these tables as "generated from the
//! catalog", which would claim of hand-written prose exactly what the site's
//! `Generated` badge exists to prevent claiming.
//!
//! What the engine DOES supply is the check. Which keys EXIST on a node comes
//! from the parser through the catalog — their ORDER does not: the catalog
//! serialises properties alphabetically and the doc set orders them
//! semantically, so 21 of the 23 full-coverage tables deliberately differ from
//! it. Order is editorial and lives in the spec. The catalog's contribution is
//! the SET, and
//! [`audit`](audit::audit) holds the spec to it: a row may not name a key the
//! node does not have, and a key the node does have must be shown, listed as
//! omitted with a reason, or covered by the table's declared subset. Which
//! codes exist comes from `DiagnosticCode` the same way. That is the value —
//! a table cannot drift from the wire in silence — and it is worth more than
//! the cell text would have been.
//!
//! **The column-count invariant is the point.** A hand-written table can carry
//! a row with more cells than its header — nine rows of `diagnostics.md` did,
//! and GFM drops every cell past the header's count, so nine codes' meanings
//! were invisible on the rendered site while the markdown looked complete.
//! Rendering from a spec makes that unrepresentable rather than merely
//! tested.
//!
//! The generated block is spliced between this module's OWN markers
//! ([`splice`]). They are deliberately not the site projection's
//! `<!-- rf:begin -->` pair: `site/src/lib/reference.ts` STRIPS that pair
//! before its byte-for-byte drift comparison, so reusing it would delete
//! these tables from the projected body and red the round-trip gate.

mod audit;
mod generate;
mod render;
mod spec;
mod splice;

pub use audit::{audit, node_schema, Problem};
pub use generate::{page, pages, Error, Inputs};
pub use render::{render, Missing, Registry};
pub use spec::{parse, Cell, Column, Coverage, Row, Spec, Table};
pub use splice::{splice, start_marker, SpliceError, CLOSE, OPEN};

#[cfg(test)]
mod tests;
