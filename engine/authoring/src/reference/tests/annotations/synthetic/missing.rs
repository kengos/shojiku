//! The node-versus-annotation disagreements: a node with no prose, prose
//! naming no node, and prose that is present but empty or a placeholder.

use super::{catalog, complete, prose};
use crate::reference::annotations::{audit, Problem};
use serde_json::json;
use std::collections::BTreeMap;

#[test]
fn a_shape_with_no_annotation_is_named() {
    let mut annotations = complete();
    annotations.remove("Box");
    assert_eq!(
        audit(&catalog(), &annotations),
        vec![Problem::Missing("Box".into())]
    );
}

#[test]
fn a_property_with_no_annotation_is_named() {
    let mut annotations = complete();
    annotations.remove("Box.w");
    assert_eq!(
        audit(&catalog(), &annotations),
        vec![Problem::Missing("Box.w".into())]
    );
}

#[test]
fn an_annotation_naming_no_shape_is_reported() {
    let mut annotations = complete();
    annotations.insert("Ghost".into(), prose("A shape the catalog never had."));
    assert_eq!(
        audit(&catalog(), &annotations),
        vec![Problem::Unknown("Ghost".into())]
    );
}

/// The half a shape-name check misses: the SHAPE exists and the property does
/// not, which is what a renamed key leaves behind.
#[test]
fn an_annotation_naming_no_property_is_reported() {
    let mut annotations = complete();
    annotations.insert("Box.h".into(), prose("A key this shape does not carry."));
    assert_eq!(
        audit(&catalog(), &annotations),
        vec![Problem::Unknown("Box.h".into())]
    );
}

#[test]
fn a_whitespace_only_annotation_is_reported() {
    let mut annotations = complete();
    annotations.insert("Box.w".into(), prose("   \n  "));
    assert_eq!(
        audit(&catalog(), &annotations),
        vec![Problem::Blank("Box.w".into())]
    );
}

#[test]
fn a_stub_annotation_is_reported_with_its_length() {
    let mut annotations = complete();
    annotations.insert("Box.w".into(), prose("TODO"));
    assert_eq!(
        audit(&catalog(), &annotations),
        vec![Problem::Stub {
            node: "Box.w".into(),
            len: 4
        }]
    );
}

/// A document with no `$defs` has no nodes — the rule must report that rather
/// than reaching into a shape that is not there.
#[test]
fn a_catalog_with_no_defs_has_no_nodes() {
    let empty = json!({ "title": "nothing here" });
    assert_eq!(
        crate::reference::annotations::nodes(&empty),
        Vec::<String>::new()
    );
    let stray = BTreeMap::from([("Box".to_string(), prose("A shape nothing defines."))]);
    assert_eq!(audit(&empty, &stray), vec![Problem::Unknown("Box".into())]);
}
