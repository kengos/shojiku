//! Every failure leg of [`audit`], driven by hand-built pairs.
//!
//! The real catalog is complete by the time this ships, so its own audit
//! returns nothing — which means the committed pair can only ever exercise the
//! passing path. A synthetic catalog is what makes each refusal reachable, and
//! it is why the rule is a pure function over two values rather than a walk
//! over two embedded constants.
//!
//! Split by what the disagreement IS: `missing` covers a node with no prose
//! and prose naming no node, `closed` covers the clause about naming every
//! value of a fixed set. What stays here is the shared fixture pair, the
//! positive control over it, and the two claims about the rule's own surface.

use crate::reference::annotations::{audit, Problem};
use serde_json::{json, Value};
use std::collections::BTreeMap;

mod closed;
mod missing;

/// One object shape with one property, plus one closed enum.
pub(super) fn catalog() -> Value {
    json!({
        "$defs": {
            "Box": { "properties": { "w": { "type": "number" } } },
            "Align": { "enum": ["left", "right"], "type": "string" },
        }
    })
}

pub(super) fn prose(text: &str) -> String {
    text.to_string()
}

/// A complete pair, which each test below then breaks in exactly one way.
pub(super) fn complete() -> BTreeMap<String, String> {
    BTreeMap::from([
        ("Box".into(), prose("The border box an item is placed by.")),
        (
            "Box.w".into(),
            prose("Border-box width; `%` is of the parent."),
        ),
        (
            "Align".into(),
            prose("Horizontal alignment: `left` or `right`."),
        ),
    ])
}

#[test]
fn a_complete_pair_reports_nothing() {
    // The positive control the suite would otherwise lack: assert the fixture
    // has nodes at all, or an `audit` that never looks reports nothing here
    // and passes every test in this file.
    assert_eq!(
        crate::reference::annotations::nodes(&catalog()).len(),
        3,
        "the fixture must carry the nodes the refusals below remove"
    );
    assert_eq!(audit(&catalog(), &complete()), vec![]);
}

#[test]
fn every_problem_says_which_node_and_why() {
    let problems = [
        Problem::Missing("Box".into()),
        Problem::Unknown("Ghost".into()),
        Problem::Blank("Box.w".into()),
        Problem::Stub {
            node: "Box.w".into(),
            len: 4,
        },
        Problem::UnnamedValue {
            shape: "Align".into(),
            value: "right".into(),
        },
    ];
    let rendered: Vec<String> = problems.iter().map(ToString::to_string).collect();
    assert_eq!(
        rendered,
        [
            "`Box` has no annotation",
            "annotation `Ghost` names no node in the catalog",
            "`Box.w` is annotated with blank text",
            "`Box.w` is annotated with 4 chars — a stub",
            "`Align` accepts `right` and its annotation never names it",
        ]
    );
}

#[test]
fn a_malformed_annotation_file_returns_an_error_rather_than_panicking() {
    assert!(crate::reference::annotations::parse("Box: [not, prose]").is_err());
    assert!(crate::reference::annotations::parse("Box: prose enough to pass").is_ok());
}
