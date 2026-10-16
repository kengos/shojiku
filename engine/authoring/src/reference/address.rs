//! Node addresses: the dotted names (`Style.fontSize`, `Item.text.data`,
//! `PointSpec.item`) the annotation layer and the engine's fact tables use to
//! name a node of the catalog, resolved onto the subschema they name.
//!
//! An address is `$defs/<Shape>`, one of its properties, a discriminated
//! `oneOf` branch, one of THAT branch's properties, or a key of a branch with
//! no discriminator. Resolution is a lookup driven by the name, never a walk
//! of the document, so a mistyped address can only fail to resolve — it
//! cannot decorate an arbitrary subschema.

use serde_json::{Map, Value};

/// The subschema `node` names in `defs`, if the catalog carries it.
pub fn locate<'a>(defs: &'a mut Map<String, Value>, node: &str) -> Option<&'a mut Value> {
    let mut parts = node.split('.');
    let schema = parts.next().and_then(|shape| defs.get_mut(shape))?;
    resolve(schema, parts)
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

/// One segment: a property first, then a branch discriminator, then a key of
/// a branch with no discriminator. A segment spelled `@<key>` names the
/// branch with no discriminator that carries `<key>` — the alternative FORM
/// itself rather than one of its keys (`PointSpec.@item`).
///
/// Property before branch is not a preference — no shape in the catalog
/// carries both `oneOf` and `properties`, which the gate pins, so at most one
/// of the first two arms can ever match. The third reaches only branches with
/// no discriminator: a discriminated branch's keys are addressed through the
/// branch, and the audit refuses a spelling that would match both.
fn step<'a>(node: &'a mut Value, segment: &str) -> Option<&'a mut Value> {
    if let Some(key) = segment.strip_prefix('@') {
        return node
            .get_mut("oneOf")
            .and_then(Value::as_array_mut)?
            .iter_mut()
            .filter(|branch| branch.pointer("/properties/type/const").is_none())
            .find(|branch| branch.pointer(&format!("/properties/{key}")).is_some());
    }
    if node.get("properties").is_some() {
        return node
            .get_mut("properties")
            .and_then(Value::as_object_mut)
            .and_then(|props| props.get_mut(segment));
    }
    let branches = node.get_mut("oneOf").and_then(Value::as_array_mut)?;
    if let Some(at) = branches.iter().position(|branch| selects(branch, segment)) {
        return branches.get_mut(at);
    }
    branches
        .iter_mut()
        .filter(|branch| branch.pointer("/properties/type/const").is_none())
        .find_map(|branch| branch.get_mut("properties")?.get_mut(segment))
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
