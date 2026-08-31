//! The table spec: the editorial half of a generated table.
//!
//! Everything here answers a question the catalog cannot: which of a node's
//! keys this page shows, how the rows group, and what the column headers say.
//! The catalog answers the rest, and [`super::audit`] is what keeps the two
//! from disagreeing.

use serde::Deserialize;
use std::collections::BTreeMap;

/// Where a cell's text comes from.
///
/// Two of these are supplied by the engine; [`Cell::Authored`] is everything
/// else, and it REQUIRES text on every row, which [`super::audit`] enforces.
///
/// There is deliberately no `Type` / `Default` / `Description` source. Those
/// cells CANNOT be derived and say so with numbers: 124 of 129 description
/// cells and the great majority of type cells carry page context, cross-page
/// links, or a bound like `≥ 0` that a hand-written `Deserialize` enforces at
/// parse time and the schema therefore never records. A derived cell would
/// silently drop them, so the derivation is not written rather than written
/// and left switched off.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Cell {
    /// The row's keys, backticked. The one column every table has.
    Key,
    /// A diagnostic's default severity, from the code registry. Meaningless
    /// on a catalog table, where nothing has a severity.
    Severity,
    /// No source: the row must supply the text itself.
    Authored,
}

/// One column: what its header says, and where its cells come from.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Column {
    /// The header text, verbatim — `Key`, `Type / values`, `Omitted means`.
    pub header: String,
    /// The cell source. Defaults to [`Cell::Authored`] so a new column kind is
    /// a deliberate act rather than something a typo turns on.
    #[serde(default = "authored")]
    pub from: Cell,
}

fn authored() -> Cell {
    Cell::Authored
}

/// Which registry a table's rows are checked against.
///
/// Two, because the reference documents two closed sets and they are held in
/// different places: the authorable wire (the catalog, derived from the
/// parser) and the diagnostic codes (`DiagnosticCode`, a closed enum). A
/// table names which one it belongs to rather than being guessed at from its
/// columns.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    /// Rows name wire keys on [`Table::node`].
    Catalog,
    /// Rows name diagnostic codes; `node` is not used.
    Diagnostics,
}

/// How completely a table must cover its node's keys.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Coverage {
    /// Every key of the node is shown or listed in `omitted` with a reason.
    /// The default, because a silently missing key is the drift this exists
    /// to stop.
    Full,
    /// The table documents a named subset (`flex.md` shows the flex keys of a
    /// box, not all 23). `subset` says which, and where the rest live.
    Subset,
    /// The table is a cross-branch editorial summary with no single node to be
    /// complete against (`template.md`'s item-common keys). Keys are still
    /// checked to EXIST, so a retired key is still caught.
    None,
}

/// One row of a generated table.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Row {
    /// What this row documents — wire keys on a catalog table, diagnostic
    /// codes on a diagnostics one.
    ///
    /// More than one when the page groups them (`box.w` / `box.h`, or the
    /// three `repeat_*` placement codes that share one sentence); the audit
    /// counts every one as covered, so a grouped row is not a hole.
    pub keys: Vec<String>,
    /// The `Key` cell, when the keys' own spelling is not what the page shows
    /// (`style.*` for the `style` key, `from.edge` / `to.edge` for a pair).
    #[serde(default)]
    pub label: Option<String>,
    /// Per-column text that overrides the derived value, keyed by the
    /// column's header.
    ///
    /// An override is an EXCEPTION, not the normal case: `reason` says why
    /// this row's text cannot come from the catalog, and the audit refuses an
    /// override without one. Without that clause a page could override every
    /// cell and be exactly as hand-written as before, while the `Generated`
    /// badge claimed otherwise.
    #[serde(default)]
    pub cells: BTreeMap<String, String>,
    /// Why this row overrides what it overrides.
    #[serde(default)]
    pub reason: Option<String>,
}

/// One generated table.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Table {
    /// The `docs/engine/` stem this table is spliced into.
    pub page: String,
    /// Which closed set this table's rows are checked against.
    #[serde(default = "catalog")]
    pub source: Source,
    /// The catalog node whose keys the rows name — a shape (`Style`) or a
    /// discriminated branch (`Item.image`). Absent on a diagnostics table,
    /// whose rows name codes rather than keys.
    #[serde(default)]
    pub node: Option<String>,
    pub columns: Vec<Column>,
    pub rows: Vec<Row>,
    #[serde(default = "full")]
    pub coverage: Coverage,
    /// Which subset this table documents, and where the rest are. Required
    /// when `coverage` is [`Coverage::Subset`].
    #[serde(default)]
    pub subset: Option<String>,
    /// Keys the node has that this table deliberately does not show, each
    /// with the reason a reader can check.
    #[serde(default)]
    pub omitted: BTreeMap<String, String>,
}

fn full() -> Coverage {
    Coverage::Full
}

fn catalog() -> Source {
    Source::Catalog
}

/// Every generated table, keyed by `<page>#<id>` — the id the splice marker
/// carries, so a marker and its spec entry name the same thing.
pub type Spec = BTreeMap<String, Table>;

/// Parses the committed spec file.
///
/// # Errors
///
/// Returns the YAML error when the file does not match the shape above.
/// Unknown keys are refused rather than ignored: a typo'd column or row key
/// would otherwise render a silently different table.
pub fn parse(src: &str) -> Result<Spec, serde_yaml::Error> {
    serde_yaml::from_str(src)
}
