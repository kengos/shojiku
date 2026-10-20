//! Merging the annotation layer into the derived catalog.
//!
//! Prose lands on the addresses the node grammar names (resolved by
//! [`super::address`]), and this module writes them by lookup rather than by
//! walking the document. That is the point: a recursive walk would have a depth to
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
        if let Some(target) = super::address::locate(defs, node) {
            describe(target, text);
        }
    }
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
