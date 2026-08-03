//! Post-parse structural checks over a definitions schema: the root must
//! be an object, nesting/node/enum caps hold, and structural keys sit on
//! the right base types (serde can't express those conditionals).

use super::schema::{Schema, SchemaType, MAX_ENUM_VALUES, MAX_SCHEMA_DEPTH, MAX_SCHEMA_NODES};
use super::Definitions;
use crate::error::CoreError;
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
        check_node(&mut walk, &format!("properties.{name}"), schema, 1)?;
    }
    Ok(())
}

fn check_node(walk: &mut Walk, path: &str, schema: &Schema, depth: usize) -> Result<(), CoreError> {
    if depth > MAX_SCHEMA_DEPTH {
        return Err(err(
            path,
            &format!("schema nests deeper than {MAX_SCHEMA_DEPTH} levels"),
        ));
    }
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
        // the schema stays params-isomorphic; only the depth cap bounds it.
        check_node(walk, &format!("{path}.items"), items, depth + 1)?;
    }
    for (name, child) in &schema.properties {
        check_node(walk, &format!("{path}.properties.{name}"), child, depth + 1)?;
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
        line: 0,
        column: 0,
        message: Echo::from(message),
    }
}
