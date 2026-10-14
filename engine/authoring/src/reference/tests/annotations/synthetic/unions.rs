//! The nodes a `oneOf` contributes: a discriminated branch with its own keys
//! (its `type` among them), and the keys of a branch with no discriminator,
//! addressed through the shape — plus the refusal when that address would
//! name two keys at once.

use super::prose;
use crate::reference::annotations::{audit, nodes, Problem};
use serde_json::{json, Value};
use std::collections::BTreeMap;

/// A tagged union with one discriminated branch, and a value shape whose
/// object form has no discriminator.
fn catalog() -> Value {
    json!({
        "$defs": {
            "Shape": { "oneOf": [
                { "properties": { "type": { "const": "dot" }, "r": { "type": "number" } } },
            ] },
            "Size": { "oneOf": [
                { "enum": ["small"] },
                { "properties": { "w": { "type": "number" } } },
            ] },
        }
    })
}

#[test]
fn a_branch_type_key_and_an_anonymous_key_are_nodes() {
    assert_eq!(
        nodes(&catalog()),
        [
            "Shape",
            "Shape.dot",
            "Shape.dot.r",
            "Shape.dot.type",
            "Size",
            "Size.w"
        ]
    );
}

#[test]
fn an_undescribed_anonymous_key_is_named() {
    let annotations = BTreeMap::from([
        ("Shape".into(), prose("A drawable mark, picked by `type`.")),
        ("Shape.dot".into(), prose("A filled circle of radius `r`.")),
        (
            "Shape.dot.r".into(),
            prose("The circle's radius, in points."),
        ),
        (
            "Shape.dot.type".into(),
            prose("Required. `dot` selects the circle."),
        ),
        ("Size".into(), prose("`small`, or an explicit `{ w }` map.")),
    ]);
    assert_eq!(
        audit(&catalog(), &annotations),
        vec![Problem::Missing("Size.w".into())]
    );
}

/// Two object forms of one value shape that share a key leave `Pair.x`
/// addressing both, so one annotation would silently describe two keys.
#[test]
fn a_key_two_anonymous_branches_share_is_ambiguous() {
    let doc = json!({
        "$defs": {
            "Pair": { "oneOf": [
                { "properties": { "x": { "type": "number" } } },
                { "properties": { "x": { "type": "string" } } },
            ] },
        }
    });
    let annotations = BTreeMap::from([
        ("Pair".into(), prose("Either a numeric or a named `x`.")),
        ("Pair.x".into(), prose("The one key both forms carry.")),
    ]);
    assert_eq!(
        audit(&doc, &annotations),
        vec![Problem::Ambiguous("Pair.x".into())]
    );
}
