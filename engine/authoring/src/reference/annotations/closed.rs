//! Which shapes have a CLOSED value set, and what those values are.
//!
//! Two spellings reach the catalog for the same wire idea. A Rust enum whose
//! variants are all unit variants derives as a top-level `enum`; one whose
//! variants are renamed individually derives as a `oneOf` of `const`/`enum`
//! branches. Both are closed sets of literal values, and an author cannot tell
//! them apart — so the annotation rule must not either.
//!
//! Anything else is deliberately NOT closed: a branch that is a `$ref`, an
//! object, a `pattern` or a bare type admits values this module cannot
//! enumerate, and treating it as closed would put a false completeness claim
//! behind the gate.

use serde_json::Value;

/// The literal values a shape accepts, or `None` when the set is not closed.
///
/// Values come back as an author WRITES them, which is why a number renders
/// `0` rather than `0.0`: `FlexBasis` accepts the literal `0` beside the
/// string `content`, and prose naming `` `0.0` `` would be wrong about the
/// wire.
#[must_use]
pub fn closed_values(schema: &Value) -> Option<Vec<String>> {
    literal_list(schema.get("enum")?)
}

/// The `oneOf` spelling of the same idea: a union EVERY branch of which is a
/// literal, so the set really is closed and absence really is information.
#[must_use]
pub fn closed_union(schema: &Value) -> Option<Vec<String>> {
    let branches = schema.get("oneOf")?.as_array()?;
    let mut out = Vec::new();
    for branch in branches {
        out.extend(branch_values(branch)?);
    }
    (!out.is_empty()).then_some(out)
}

/// Every literal a shape accepts, whether or not it ALSO accepts something
/// this module cannot enumerate.
///
/// The distinction from [`closed_union`] is a completeness claim, not a prose
/// obligation. `PageSize` takes eight named papers OR a `{ w, h }` map, so its
/// set is not closed — and its eight names still have to be written down,
/// because a description that says "the ISO A series" invites `A2`, which the
/// parser refuses. Keying the annotation clause on the strict version left
/// exactly that shape unguarded, and it was the one instance in the tree.
#[must_use]
pub fn literal_values(schema: &Value) -> Option<Vec<String>> {
    if let Some(values) = closed_values(schema) {
        return Some(values);
    }
    let branches = schema.get("oneOf")?.as_array()?;
    let out: Vec<String> = branches
        .iter()
        .filter_map(branch_values)
        .flatten()
        .collect();
    (!out.is_empty()).then_some(out)
}

/// One `oneOf` branch, if it contributes literal values and nothing else.
///
/// The key-set check is what keeps this honest: a branch carrying a `pattern`
/// or `properties` beside its `const` is not a plain literal, and one branch
/// this function cannot read closes the whole shape out.
fn branch_values(branch: &Value) -> Option<Vec<String>> {
    let keys = branch.as_object()?;
    let named: Vec<&str> = keys.keys().map(String::as_str).collect();
    match named.as_slice() {
        ["const"] | ["const", "type"] => literal(branch.get("const")?).map(|v| vec![v]),
        ["enum"] | ["enum", "type"] => literal_list(branch.get("enum")?),
        _ => None,
    }
}

/// A JSON array of literals, rendered as authored spellings.
fn literal_list(node: &Value) -> Option<Vec<String>> {
    node.as_array()?.iter().map(literal).collect()
}

/// One literal, or `None` for anything an author cannot write as a scalar.
fn literal(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}
