//! Structural checks over a definitions schema: the root must be an
//! object, nesting/node/enum caps hold, and structural keys sit on the right
//! base types (serde can't express those conditionals).
//!
//! The nesting cap is the one check made BEFORE the typed parse, on the
//! pass-1 `Value` ([`check_depth`]): a `Schema` nests through `properties`
//! and `items`, and a deep enough chain inside serde_yaml's own limit could
//! exhaust a thread's stack while being read into the model — an abort, not
//! an error. The rest run after it, over the parsed [`Definitions`].

use super::schema::{Schema, SchemaType, MAX_ENUM_VALUES, MAX_SCHEMA_DEPTH, MAX_SCHEMA_NODES};
use super::Definitions;
use crate::error::CoreError;
use serde_yaml::Value;
use shojiku_diagnostics::Echo;

/// Walk state: the running node budget.
struct Walk {
    nodes: usize,
}

/// Checks the parsed definitions' shape; any violation is a located
/// parse error (line 0 — the path names the offending schema node).
pub(super) fn check_shape(defs: &Definitions) -> Result<(), CoreError> {
    if defs.schema_type != SchemaType::Object {
        return Err(err(
            "type",
            "the definitions root must be `type: object` with `properties`",
        ));
    }
    check_required_declared("required", &defs.required, &defs.properties)?;
    let mut walk = Walk { nodes: 0 };
    for (name, schema) in &defs.properties {
        check_node(&mut walk, &format!("properties.{name}"), schema)?;
    }
    Ok(())
}

/// Refuses a schema nested deeper than [`MAX_SCHEMA_DEPTH`], on the pass-1
/// tree. It walks exactly what the typed parse would descend — a node's
/// `items`, then its `properties` in key order, as the parsed `BTreeMap`
/// iterates them — so the first path it reports is the one the post-parse
/// walk reported when the cap lived there. Being a pass of its own ahead of
/// the typed parse, it also wins over every other schema error: a file both
/// too deep and over the node or enum cap (or mistyped) reports the depth.
pub(super) fn check_depth(raw: &Value) -> Result<(), CoreError> {
    for_each_property(raw, "properties", 1)
}

fn depth_node(node: &Value, path: &str, depth: usize) -> Result<(), CoreError> {
    if depth > MAX_SCHEMA_DEPTH {
        return Err(err(
            path,
            &format!("schema nests deeper than {MAX_SCHEMA_DEPTH} levels"),
        ));
    }
    if let Some(items) = field(node, "items") {
        depth_node(items, &format!("{path}.items"), depth + 1)?;
    }
    for_each_property(node, &format!("{path}.properties"), depth + 1)
}

/// Every schema under `node`'s `properties`, string keys in sorted order and
/// any other key after them (the typed parse refuses those, but a bound does
/// not get to assume which error comes first).
fn for_each_property(node: &Value, path: &str, depth: usize) -> Result<(), CoreError> {
    let Some(Value::Mapping(props)) = field(node, "properties").map(untag) else {
        return Ok(());
    };
    let mut named: Vec<(&str, &Value)> = Vec::new();
    let mut other: Vec<&Value> = Vec::new();
    for (key, child) in props {
        match key.as_str() {
            Some(name) => named.push((name, child)),
            None => other.push(child),
        }
    }
    named.sort_by(|a, b| a.0.cmp(b.0));
    for (name, child) in named {
        depth_node(child, &format!("{path}.{name}"), depth)?;
    }
    for child in other {
        depth_node(child, &format!("{path}.?"), depth)?;
    }
    Ok(())
}

fn field<'a>(node: &'a Value, key: &str) -> Option<&'a Value> {
    match untag(node) {
        Value::Mapping(map) => map.get(key),
        _ => None,
    }
}

/// A tag (`!name`) changes nothing about what a node nests.
fn untag(mut node: &Value) -> &Value {
    while let Value::Tagged(tagged) = node {
        node = &tagged.value;
    }
    node
}

fn check_node(walk: &mut Walk, path: &str, schema: &Schema) -> Result<(), CoreError> {
    walk.nodes += 1;
    if walk.nodes > MAX_SCHEMA_NODES {
        return Err(err(
            path,
            &format!("definitions declare more than {MAX_SCHEMA_NODES} schema nodes"),
        ));
    }
    check_enum_entries(path, schema)?;
    let is_object = schema.schema_type == SchemaType::Object;
    let is_array = schema.schema_type == SchemaType::Array;
    if !schema.properties.is_empty() && !is_object {
        return Err(err(path, "`properties` requires `type: object`"));
    }
    if !schema.required.is_empty() && !is_object {
        return Err(err(path, "`required` requires `type: object`"));
    }
    check_required_declared(path, &schema.required, &schema.properties)?;
    if schema.items.is_some() && !is_array {
        return Err(err(path, "`items` requires `type: array`"));
    }
    if let Some(items) = &schema.items {
        // Arrays nest anywhere the params do (a row can carry a list) —
        // the schema stays params-isomorphic; only the depth cap (checked
        // before the parse, in `check_depth`) bounds it.
        check_node(walk, &format!("{path}.items"), items)?;
    }
    for (name, child) in &schema.properties {
        check_node(walk, &format!("{path}.properties.{name}"), child)?;
    }
    Ok(())
}

/// The `enum` list stays within its cap, and a LABELED entry declares a
/// scalar value: a labeled container could never match a params value
/// (membership is checked for scalar-typed fields only), so accepting one
/// would promise a label that can never render.
fn check_enum_entries(path: &str, schema: &Schema) -> Result<(), CoreError> {
    let Some(values) = &schema.enum_values else {
        return Ok(());
    };
    if values.len() > MAX_ENUM_VALUES {
        return Err(err(
            path,
            &format!("`enum` lists more than {MAX_ENUM_VALUES} values"),
        ));
    }
    for entry in values {
        if entry.label().is_some() && (entry.value().is_object() || entry.value().is_array()) {
            return Err(err(path, "a labeled `enum` entry needs a scalar `value`"));
        }
    }
    Ok(())
}

/// Every `required` entry must name a declared property — a typo there
/// would otherwise warn `params_missing_required` AND `params_unknown_key`
/// at once on the same data (this closed subset has no
/// `additionalProperties`).
fn check_required_declared(
    path: &str,
    required: &[String],
    properties: &std::collections::BTreeMap<String, super::Schema>,
) -> Result<(), CoreError> {
    for key in required {
        if !properties.contains_key(key) {
            return Err(err(
                path,
                "`required` names a key that is not a declared property",
            ));
        }
    }
    Ok(())
}

/// A located error with no line info: the schema path is the locator.
///
/// `path` comes from the document; `message` is always a literal from this
/// module, but both take the same bounded type so the distinction never has
/// to be re-derived by whoever adds the next check.
fn err(path: &str, message: &str) -> CoreError {
    CoreError::Located {
        what: "definitions",
        path: Echo::from(path),
        key: None,
        line: 0,
        column: 0,
        message: Echo::from(message),
    }
}
