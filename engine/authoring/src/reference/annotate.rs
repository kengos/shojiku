//! Merging the annotation layer into the derived catalog.
//!
//! Prose lands on the addresses the node grammar names — `$defs/<Shape>`, one
//! of its properties, a discriminated `oneOf` branch, or one of THAT branch's
//! properties — and this module writes them by lookup rather than by walking
//! the document. That is the point: a recursive walk would have a depth to
//! bound and would let a mistyped annotation key decorate an arbitrary
//! subschema. A lookup driven by the node name can only ever reach a node the
//! audit also knows about, so the two agree by construction.
//!
//! Feature-gated with the rest of generation, so a default build links none of
//! it. What the default suite checks instead is the RESULT: every node in the
//! committed artifact carries exactly its annotation, which is a stronger
//! claim than any test of this walk.

use serde_json::{Map, Value};
use std::collections::BTreeMap;

/// Writes each annotation onto the node it names.
///
/// Silently skips a node the catalog does not carry: this runs beside
/// [`super::annotations::audit`], which reports that case by name, and
/// duplicating the refusal here would give the same fault two voices.
pub fn merge(defs: &mut Map<String, Value>, annotations: &BTreeMap<String, String>) {
    for (node, text) in annotations {
        let mut parts = node.split('.');
        let Some(schema) = parts.next().and_then(|shape| defs.get_mut(shape)) else {
            continue;
        };
        if let Some(target) = resolve(schema, parts) {
            describe(target, text);
        }
    }
}

/// Walks the dotted tail of a node name onto the subschema it addresses.
///
/// A segment is a property of the schema in hand, or — where the schema is a
/// tagged union — the discriminator selecting one of its `oneOf` branches. The
/// tail is at most two segments long, so this terminates on the node grammar
/// rather than on a depth bound.
fn resolve<'a>(schema: &'a mut Value, tail: std::str::Split<'_, char>) -> Option<&'a mut Value> {
    let mut node = schema;
    for segment in tail {
        node = step(node, segment)?;
    }
    Some(node)
}

/// One segment: a property first, then a branch discriminator.
///
/// Property before branch is not a preference — no shape in the catalog
/// carries both `oneOf` and `properties`, which the gate pins, so at most one
/// arm can ever match.
fn step<'a>(node: &'a mut Value, segment: &str) -> Option<&'a mut Value> {
    if node.get("properties").is_some() {
        return node
            .get_mut("properties")
            .and_then(Value::as_object_mut)
            .and_then(|props| props.get_mut(segment));
    }
    node.get_mut("oneOf")
        .and_then(Value::as_array_mut)
        .and_then(|branches| branches.iter_mut().find(|branch| selects(branch, segment)))
}

/// Whether a branch's discriminator is pinned to `name`.
fn selects(branch: &Value, name: &str) -> bool {
    branch
        .get("properties")
        .and_then(|props| props.get("type"))
        .and_then(|discriminator| discriminator.get("const"))
        .and_then(Value::as_str)
        == Some(name)
}

/// Sets `description` on one subschema.
///
/// `Option<serde_json::Value>` derives as the boolean schema `true`, which has
/// nowhere to put prose. `true` and `{}` are the same schema — both accept
/// every instance — so the node is upgraded in place rather than left as the
/// one key an author can never read about. `Schema.recommendedStyle` is the
/// only node in the shipped catalog that takes this path.
fn describe(node: &mut Value, text: &str) {
    if !node.is_object() {
        *node = Value::Object(Map::new());
    }
    if let Some(map) = node.as_object_mut() {
        map.insert("description".into(), Value::String(text.to_string()));
    }
}
