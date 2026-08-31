//! Unit tests for the generated-table machinery.
//!
//! Split by concern; the shared synthetic fixtures live here because every
//! file uses them. They are SYNTHETIC on purpose — a rule's failure legs have
//! to be reachable without waiting for the real wire to grow a hole, which is
//! the same reason the annotation audit next door is tested this way.

use super::spec::{Spec, Table};
use serde_json::{json, Value};

mod audit;
mod codes;
mod committed;
mod generate;
mod render;
mod shape;
mod spec;
mod splice;

/// A two-shape catalog: one plain shape and one tagged union, which between
/// them reach every branch of the node lookup.
pub fn catalog() -> Value {
    json!({
        "$defs": {
            "Box": {
                "properties": {
                    "w": { "type": ["number", "null"] },
                    "h": { "type": ["number", "null"] },
                    "fit": { "$ref": "#/$defs/Fit" }
                }
            },
            "Fit": {
                "oneOf": [
                    { "const": "contain", "type": "string" },
                    { "const": "cover", "type": "string" }
                ]
            },
            "Item": {
                "oneOf": [
                    {
                        "properties": {
                            "type": { "const": "text" },
                            "text": { "type": "string" }
                        }
                    },
                    {
                        "properties": {
                            "type": { "const": "rect" },
                            "fill": { "type": "string" }
                        }
                    }
                ]
            }
        }
    })
}

/// A spec over [`catalog`] that the audit passes clean — the baseline every
/// failure test perturbs by exactly one thing.
pub fn spec_yaml() -> &'static str {
    r#"
"box#keys":
  page: box
  node: Box
  coverage: full
  columns:
    - header: "Key"
      from: key
    - header: "Type"
      from: authored
    - header: "Description"
      from: authored
  rows:
    - keys: ["w", "h"]
      label: "`w` / `h`"
      cells:
        "Type": "number"
        "Description": "The border-box size."
    - keys: ["fit"]
      cells:
        "Type": "`contain` | `cover`"
        "Description": "How the content fills the box."
"#
}

pub fn spec() -> Spec {
    super::spec::parse(spec_yaml()).expect("the baseline fixture parses")
}

/// The baseline's single table, for tests that perturb one field.
pub fn table() -> Table {
    spec()
        .remove("box#keys")
        .expect("the baseline names one table")
}

/// A two-code registry, standing in for `DiagnosticCode::ALL`.
pub fn registry() -> std::collections::BTreeMap<String, String> {
    std::collections::BTreeMap::from([
        ("bad_size".to_owned(), "warning".to_owned()),
        ("no_root".to_owned(), "error".to_owned()),
    ])
}

/// Just the code names — what the audit checks rows against.
pub fn codes() -> std::collections::BTreeSet<String> {
    registry().into_keys().collect()
}

/// A diagnostics table over [`registry`], grouping both codes into one row
/// the way the real `diagnostics.md` groups a family that shares a sentence.
pub fn diagnostics_yaml() -> &'static str {
    r#"
"diagnostics#assets":
  page: diagnostics
  source: diagnostics
  columns:
    - header: "Code"
      from: key
    - header: "Severity"
      from: severity
    - header: "Meaning"
      from: authored
  rows:
    - keys: ["bad_size", "no_root"]
      cells:
        "Meaning": "the asset could not be placed"
      reason: "the row groups two codes that share one sentence"
"#
}
