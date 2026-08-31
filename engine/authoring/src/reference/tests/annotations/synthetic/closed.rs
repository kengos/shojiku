//! The closed-value clause: a shape whose accepted values are a fixed list
//! must have every one of them named in its prose.
//!
//! It is the one MECHANICAL guard against a description that errs WIDE, which
//! is the direction that misleads — prose claiming more than the parser takes
//! teaches an agent to emit input the engine rejects.

use super::{catalog, complete, prose};
use crate::reference::annotations::{audit, Problem};
use serde_json::json;
use std::collections::BTreeMap;

#[test]
fn a_closed_set_whose_prose_omits_a_value_names_that_value() {
    let mut annotations = complete();
    annotations.insert("Align".into(), prose("Horizontal alignment: `left`."));
    assert_eq!(
        audit(&catalog(), &annotations),
        vec![Problem::UnnamedValue {
            shape: "Align".into(),
            value: "right".into()
        }]
    );
}

/// The `oneOf` spelling of a closed set reaches the same clause. A Rust enum
/// derives one way or the other depending on how its variants are renamed, and
/// an author cannot tell which — so neither may the rule.
#[test]
fn a_closed_union_is_held_to_the_same_clause_as_an_enum() {
    let catalog = json!({
        "$defs": {
            "Kind": { "oneOf": [
                { "const": "flex", "type": "string" },
                { "const": "grid", "type": "string" },
            ]}
        }
    });
    let named = BTreeMap::from([(
        "Kind".to_string(),
        prose("A container's layout mode: `flex` or `grid`."),
    )]);
    assert_eq!(audit(&catalog, &named), vec![]);

    let half = BTreeMap::from([(
        "Kind".to_string(),
        prose("A container's layout mode, `flex` being the usual one."),
    )]);
    assert_eq!(
        audit(&catalog, &half),
        vec![Problem::UnnamedValue {
            shape: "Kind".into(),
            value: "grid".into()
        }]
    );
}

/// A union with a branch this rule cannot enumerate is NOT closed — nothing
/// can say those are all the values — but the branch that IS a literal still
/// owes its name. Both halves are asserted, because the difference between
/// them is the whole point: the completeness claim shrinks, the prose
/// obligation does not.
#[test]
fn a_union_with_a_non_literal_branch_still_owes_its_literal() {
    let catalog = json!({
        "$defs": {
            "Width": { "oneOf": [
                { "const": "auto", "type": "string" },
                { "type": "number" },
            ]}
        }
    });
    assert!(
        crate::reference::annotations::closed_union(&catalog["$defs"]["Width"]).is_none(),
        "a union with a bare-type branch is not a closed set"
    );
    let vague = BTreeMap::from([(
        "Width".to_string(),
        prose("A width: a number of points, or the keyword that fills."),
    )]);
    assert_eq!(
        audit(&catalog, &vague),
        vec![Problem::UnnamedValue {
            shape: "Width".into(),
            value: "auto".into()
        }]
    );
    let named = BTreeMap::from([(
        "Width".to_string(),
        prose("A width: a number of points, or `auto` to fill what is left."),
    )]);
    assert_eq!(audit(&catalog, &named), vec![]);
}

/// A number literal is named the way an author writes it. `FlexBasis` is the
/// shipped instance: it accepts the literal `0` beside a string.
#[test]
fn a_numeric_literal_is_named_as_authored() {
    let catalog = json!({
        "$defs": {
            "Basis": { "oneOf": [
                { "const": "content", "type": "string" },
                { "const": 0, "type": "number" },
            ]}
        }
    });
    let annotations = BTreeMap::from([(
        "Basis".to_string(),
        prose("The flex base size: `content`, or the literal `0`."),
    )]);
    assert_eq!(audit(&catalog, &annotations), vec![]);
}

/// A boolean-valued closed set is still a closed set. No shipped shape is one
/// today, and the arm that renders `true`/`false` is exactly the kind that
/// rots unexercised — so it is driven here rather than left to a future wire
/// change to discover.
#[test]
fn a_boolean_closed_set_is_named_as_authored() {
    let catalog = json!({
        "$defs": {
            "Toggle": { "oneOf": [
                { "const": true, "type": "boolean" },
                { "const": false, "type": "boolean" },
            ]}
        }
    });
    let named = BTreeMap::from([(
        "Toggle".to_string(),
        prose("Either `true` or `false`, and nothing else."),
    )]);
    assert_eq!(audit(&catalog, &named), vec![]);

    let half = BTreeMap::from([(
        "Toggle".to_string(),
        prose("Set it to `true` to turn the thing on."),
    )]);
    assert_eq!(
        audit(&catalog, &half),
        vec![Problem::UnnamedValue {
            shape: "Toggle".into(),
            value: "false".into()
        }]
    );
}

/// A branch pinned to a value an author cannot WRITE as a scalar contributes
/// nothing to either population — it has no spelling to demand — while a
/// literal branch beside it is unaffected.
#[test]
fn a_branch_pinned_to_a_container_contributes_no_name() {
    let catalog = json!({
        "$defs": {
            "Odd": { "oneOf": [
                { "const": { "nested": 1 } },
                { "const": "plain", "type": "string" },
            ]}
        }
    });
    let named = BTreeMap::from([(
        "Odd".to_string(),
        prose("Either `plain`, or a shape with no scalar spelling."),
    )]);
    assert_eq!(audit(&catalog, &named), vec![]);
}

/// A shape whose ONLY branches are unspellable carries no literals at all, and
/// the clause stays silent rather than demanding prose name a value that
/// cannot be written.
#[test]
fn a_union_of_only_unspellable_branches_owes_nothing() {
    let catalog = json!({
        "$defs": {
            "Shapeless": { "oneOf": [
                { "const": { "nested": 1 } },
                { "type": "object" },
            ]}
        }
    });
    let annotations = BTreeMap::from([(
        "Shapeless".to_string(),
        prose("Something this rule cannot enumerate the values of."),
    )]);
    assert_eq!(audit(&catalog, &annotations), vec![]);
}

/// A closed set with NO annotation is reported once, as missing — not twice,
/// as missing and then as failing to name every value it has. The clause about
/// values is about prose that exists.
#[test]
fn an_unannotated_closed_set_is_reported_only_as_missing() {
    let catalog = json!({
        "$defs": { "Align": { "enum": ["left", "right"], "type": "string" } }
    });
    assert_eq!(
        audit(&catalog, &BTreeMap::new()),
        vec![Problem::Missing("Align".into())]
    );
}

/// A union that takes a literal AND something this rule cannot enumerate still
/// owes its literals. This is the shape the clause originally missed:
/// `PageSize` accepts eight named papers or a `{ w, h }` map, and keying the
/// clause on the strictly-closed set left all eight unguarded — in an artifact
/// whose whole purpose is to stop prose claiming more than the parser takes.
#[test]
fn a_union_that_also_takes_a_map_still_owes_its_literal_names() {
    let catalog = json!({
        "$defs": {
            "Paper": { "oneOf": [
                { "enum": ["A4", "Letter"] },
                { "properties": { "w": { "type": "number" }, "h": { "type": "number" } },
                  "required": ["w", "h"], "type": "object" },
            ]}
        }
    });
    let vague = BTreeMap::from([(
        "Paper".to_string(),
        prose("One of the named papers, or a custom size given as a map."),
    )]);
    assert_eq!(
        audit(&catalog, &vague),
        vec![
            Problem::UnnamedValue {
                shape: "Paper".into(),
                value: "A4".into()
            },
            Problem::UnnamedValue {
                shape: "Paper".into(),
                value: "Letter".into()
            },
        ]
    );

    let named = BTreeMap::from([(
        "Paper".to_string(),
        prose("`A4` or `Letter`, or a custom size given as a `{ w, h }` map."),
    )]);
    assert_eq!(audit(&catalog, &named), vec![]);
}
