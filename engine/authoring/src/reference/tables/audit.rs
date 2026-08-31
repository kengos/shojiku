//! The rule that keeps a generated table honest against the catalog.
//!
//! Rendering from a spec makes the tables CONSISTENT; it does not make them
//! COMPLETE. Nothing in the renderer notices that a key was added to the wire
//! and to nobody's table — which is the drift the whole catalog exists to
//! stop. This is what notices, and it reports by name rather than by count so
//! a failure is actionable without re-running anything.

use super::spec::{Cell, Coverage, Source, Spec, Table};
use serde_json::Value;
use std::collections::BTreeSet;
use std::fmt;

/// One way a spec and the catalog disagree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Problem {
    /// A table naming a node the catalog does not define.
    UnknownNode { id: String, node: String },
    /// A catalog table with no `node:` to be checked against.
    NoNode { id: String },
    /// A diagnostics row naming a code the registry does not define — a typo,
    /// or a code retired while its row stayed.
    UnknownCode { id: String, code: String },
    /// A registry code no diagnostics table documents. The half nothing
    /// checked before: `diagnostics.md` was complete only by diligence, and a
    /// code added to the enum shipped undocumented in silence.
    UndocumentedCode { code: String },
    /// A row naming a key the node does not have — a typo, or a key retired
    /// from the wire while its row stayed.
    UnknownKey { id: String, key: String },
    /// A key the node has that the table neither shows nor excuses.
    Uncovered { id: String, key: String },
    /// An `omitted` entry for a key the node no longer has.
    StaleOmission { id: String, key: String },
    /// An `omitted` entry with no reason a reader can check.
    BlankReason { id: String, key: String },
    /// `coverage: subset` with nothing saying which subset.
    UnnamedSubset { id: String },
    /// A cell override with no reason — the clause that stops "generated"
    /// decaying back into "hand-written, spliced by a machine".
    UnexplainedOverride { id: String, key: String },
    /// A column no source can fill, on a row that supplies no text.
    EmptyAuthored {
        id: String,
        key: String,
        column: String,
    },
}

impl fmt::Display for Problem {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnknownNode { id, node } => write!(f, "`{id}`: no catalog node `{node}`"),
            Self::NoNode { id } => write!(f, "`{id}`: a catalog table with no `node:`"),
            Self::UnknownCode { id, code } => {
                write!(f, "`{id}`: the registry has no code `{code}`")
            }
            Self::UndocumentedCode { code } => {
                write!(f, "`{code}` is in the registry and in no reference table")
            }
            Self::UnknownKey { id, key } => write!(f, "`{id}`: its node has no key `{key}`"),
            Self::Uncovered { id, key } => {
                write!(f, "`{id}`: `{key}` is neither shown nor listed as omitted")
            }
            Self::StaleOmission { id, key } => {
                write!(f, "`{id}`: omits `{key}`, which the node no longer has")
            }
            Self::BlankReason { id, key } => write!(f, "`{id}`: omits `{key}` with no reason"),
            Self::UnnamedSubset { id } => {
                write!(f, "`{id}`: declares `coverage: subset` and no `subset:`")
            }
            Self::UnexplainedOverride { id, key } => {
                write!(f, "`{id}`: row `{key}` overrides a cell with no `reason:`")
            }
            Self::EmptyAuthored { id, key, column } => {
                write!(
                    f,
                    "`{id}`: row `{key}` supplies no `{column}` and none can be derived"
                )
            }
        }
    }
}

/// The schema for a spec's node — a named shape (`Style`) or one
/// discriminated branch of a tagged union (`Item.image`).
#[must_use]
pub fn node_schema<'a>(catalog: &'a Value, node: &str) -> Option<&'a Value> {
    let defs = catalog.get("$defs")?;
    if let Some(schema) = defs.get(node) {
        return Some(schema);
    }
    let (shape, branch) = node.split_once('.')?;
    defs.get(shape)?
        .get("oneOf")?
        .as_array()?
        .iter()
        .find(|arm| {
            arm.get("properties")
                .and_then(|p| p.get("type"))
                .and_then(|t| t.get("const"))
                .and_then(Value::as_str)
                == Some(branch)
        })
}

/// Every key a node accepts.
fn keys_of(schema: &Value) -> BTreeSet<String> {
    schema
        .get("properties")
        .and_then(Value::as_object)
        .map(|p| p.keys().cloned().collect())
        .unwrap_or_default()
}

/// Every key any branch of a tagged union accepts — the set a cross-branch
/// summary table (`template.md`'s item-common keys) is checked against.
fn union_keys(catalog: &Value, shape: &str) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    let arms = catalog
        .get("$defs")
        .and_then(|d| d.get(shape))
        .and_then(|s| s.get("oneOf"))
        .and_then(Value::as_array);
    for arm in arms.into_iter().flatten() {
        out.extend(keys_of(arm));
    }
    out
}

/// Reports every disagreement between the spec, the catalog and the
/// diagnostic-code registry. An empty result is the gate.
///
/// `registry` is every wire code the engine can emit — `DiagnosticCode::ALL`,
/// passed in rather than read here so the rule stays a pure function over
/// three values and every failure leg is reachable from a synthetic triple.
#[must_use]
pub fn audit(catalog: &Value, spec: &Spec, registry: &BTreeSet<String>) -> Vec<Problem> {
    let mut problems = Vec::new();
    let mut documented = BTreeSet::new();
    for (id, table) in spec {
        one(catalog, id, table, registry, &mut documented, &mut problems);
    }
    for code in registry {
        if !documented.contains(code) {
            problems.push(Problem::UndocumentedCode { code: code.clone() });
        }
    }
    problems
}

fn one(
    catalog: &Value,
    id: &str,
    table: &Table,
    registry: &BTreeSet<String>,
    documented: &mut BTreeSet<String>,
    out: &mut Vec<Problem>,
) {
    if table.source == Source::Diagnostics {
        codes(id, table, registry, documented, out);
        return;
    }
    let Some(node) = table.node.as_deref() else {
        out.push(Problem::NoNode { id: id.to_owned() });
        return;
    };
    let accepted = match table.coverage {
        Coverage::None => union_keys(catalog, node),
        _ => match node_schema(catalog, node) {
            Some(schema) => keys_of(schema),
            None => {
                out.push(Problem::UnknownNode {
                    id: id.to_owned(),
                    node: node.to_owned(),
                });
                return;
            }
        },
    };
    if table.coverage == Coverage::Subset
        && table.subset.as_ref().is_none_or(|s| s.trim().is_empty())
    {
        out.push(Problem::UnnamedSubset { id: id.to_owned() });
    }
    let mut shown = BTreeSet::new();
    for row in &table.rows {
        for key in &row.keys {
            let root = key.split('.').next().unwrap_or(key);
            if accepted.contains(root) {
                shown.insert(root.to_owned());
            } else {
                out.push(Problem::UnknownKey {
                    id: id.to_owned(),
                    key: key.clone(),
                });
            }
        }
        row_cells(id, table, row, out);
    }
    for (key, reason) in &table.omitted {
        if !accepted.contains(key) {
            out.push(Problem::StaleOmission {
                id: id.to_owned(),
                key: key.clone(),
            });
        } else if reason.trim().is_empty() {
            out.push(Problem::BlankReason {
                id: id.to_owned(),
                key: key.clone(),
            });
        }
    }
    if table.coverage == Coverage::Full {
        for key in accepted {
            if !shown.contains(&key) && !table.omitted.contains_key(&key) {
                out.push(Problem::Uncovered {
                    id: id.to_owned(),
                    key,
                });
            }
        }
    }
}

/// A diagnostics table: its rows name codes, and the registry is what says
/// whether each one is real.
///
/// A code may legitimately appear in TWO rows — `not_an_array` and
/// `container_depth_exceeded` are each raised at validate time and again at
/// layout time, and the two sections say different, context-specific things
/// about them. So the rule is "every code is documented at least once", never
/// "exactly once", which would have forced a wrong edit on both.
fn codes(
    id: &str,
    table: &Table,
    registry: &BTreeSet<String>,
    documented: &mut BTreeSet<String>,
    out: &mut Vec<Problem>,
) {
    for row in &table.rows {
        for code in &row.keys {
            if registry.contains(code) {
                documented.insert(code.clone());
            } else {
                out.push(Problem::UnknownCode {
                    id: id.to_owned(),
                    code: code.clone(),
                });
            }
        }
        row_cells(id, table, row, out);
    }
}

/// The per-row checks both kinds of table owe: an override needs a reason, and
/// a column no source can fill needs text.
fn row_cells(id: &str, table: &Table, row: &super::spec::Row, out: &mut Vec<Problem>) {
    let first = row.keys.first().cloned().unwrap_or_default();
    // Only a DERIVED column can be overridden. Text for an `authored` column
    // is that column's only source, so demanding a reason for it would ask
    // every row of `document.md`'s `PDF /Info` table to justify existing.
    let overrides = table
        .columns
        .iter()
        .any(|c| c.from != Cell::Authored && row.cells.contains_key(&c.header));
    if overrides && row.reason.as_ref().is_none_or(|r| r.trim().is_empty()) {
        out.push(Problem::UnexplainedOverride {
            id: id.to_owned(),
            key: first.clone(),
        });
    }
    for column in &table.columns {
        if column.from == Cell::Authored && !row.cells.contains_key(&column.header) {
            out.push(Problem::EmptyAuthored {
                id: id.to_owned(),
                key: first.clone(),
                column: column.header.clone(),
            });
        }
    }
}
