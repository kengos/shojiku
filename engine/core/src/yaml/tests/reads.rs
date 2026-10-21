//! Typed reads through the door — from a document's source and from a tree —
//! and the tree's own accessors.

use crate::yaml::{Value, YamlErrorKind, from_str, from_value, parse};
use serde::Deserialize;

#[derive(Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct Doc {
    items: Vec<Entry>,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct Entry {
    name: String,
}

#[test]
fn a_typed_read_takes_the_parser_scalar_rules() {
    // A plain scalar lands in a string field as its text, which a tree,
    // having read `2024` as a number, would refuse.
    let doc: Doc = from_str("items:\n  - name: 2024\n").expect("reads");
    assert_eq!(doc.items[0].name, "2024");
    let tree = parse("items:\n  - name: 2024\n")
        .expect("parses")
        .into_tree();
    assert_eq!(
        from_value::<Doc>(&tree).expect_err("strict").kind,
        YamlErrorKind::Shape
    );
}

#[test]
fn a_typed_failure_carries_the_field_path_and_location() {
    let document = parse("items:\n  - name: a\n    bogus: x\n").expect("well-formed");
    assert!(document.tree().get("items").is_some());
    let err = document.typed::<Doc>().expect_err("unknown field");
    assert_eq!(err.kind, YamlErrorKind::Shape);
    assert_eq!(err.path.as_deref(), Some("items[0].bogus"));
    assert_eq!((err.line, err.column), (3, 5), "{err:?}");
    assert!(err.message.contains("unknown field `bogus`"), "{err:?}");
}

#[test]
fn a_typed_read_runs_every_check_first() {
    let err = from_str::<Doc>("items:\n  - name: .inf\n").expect_err("refused");
    // Read for its type alone, `.inf` would be the string a name is.
    assert_eq!(err.kind, YamlErrorKind::NonFinite);
}

#[derive(Debug, Deserialize, PartialEq)]
struct Count(u32);

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
enum Fill {
    None,
    Solid(String),
}

#[derive(Debug, Deserialize, PartialEq)]
struct Shapes {
    count: Count,
    fills: Vec<Fill>,
    label: Option<String>,
    note: Option<String>,
}

#[test]
fn a_tree_reads_newtypes_options_and_both_variant_spellings() {
    let tree = parse("count: 3\nfills: [none, { solid: red }]\nlabel: ~\nnote: hi\n")
        .expect("parses")
        .into_tree();
    let shapes: Shapes = from_value(&tree).expect("reads");
    assert_eq!(
        shapes,
        Shapes {
            count: Count(3),
            fills: vec![Fill::None, Fill::Solid("red".to_owned())],
            label: None,
            note: Some("hi".to_owned()),
        }
    );
}

#[test]
fn a_tree_failure_carries_the_path_below_the_subtree_and_no_location() {
    let tree = parse("count: 3\nfills: [none, [solid]]\nlabel: ~\nnote: ~\n")
        .expect("parses")
        .into_tree();
    let err = from_value::<Shapes>(&tree).expect_err("a variant is a name or a one-key mapping");
    assert_eq!(err.path.as_deref(), Some("fills[1]"));
    assert_eq!((err.line, err.column), (0, 0));
    assert!(err.message.contains("expected a variant name"), "{err:?}");
    // A sequence longer than the tuple it fills is refused, not truncated.
    let pair = parse("[1, 2, 3]").expect("parses").into_tree();
    assert!(from_value::<(i64, i64)>(&pair).is_err());
}

#[test]
fn a_tree_converts_to_json_both_ways_through_serde() {
    let tree = parse("a: ~\nb: true\nc: -3\nd: 18446744073709551615\ne: 1.5\nf: [x]\n")
        .expect("parses")
        .into_tree();
    let json = serde_json::json!({
        "a": null, "b": true, "c": -3, "d": 18_446_744_073_709_551_615_u64, "e": 1.5, "f": ["x"]
    });
    assert_eq!(serde_json::to_value(&tree).expect("serializes"), json);
    assert_eq!(from_value::<serde_json::Value>(&tree).expect("reads"), json);
}

#[test]
fn get_finds_a_key_only_in_a_mapping() {
    let tree = parse("a: 1\nb: 2\n").expect("parses").into_tree();
    assert_eq!(tree.get("b"), Some(&Value::Int(2)));
    assert_eq!(tree.get("c"), None);
    assert_eq!(Value::Int(1).get("a"), None);
}

#[derive(Debug, Deserialize, PartialEq)]
struct Pair(u8, u8);

#[derive(Debug, Default, Deserialize, PartialEq)]
#[serde(default)]
struct Table {
    rows: Vec<u8>,
    names: std::collections::BTreeMap<String, String>,
}

#[test]
fn a_null_subtree_reads_as_an_empty_list_or_mapping() {
    // As the read it replaced did: a locale overlay clears a table this way.
    let tree = parse("rows: ~\nnames: ~\n").expect("parses").into_tree();
    assert_eq!(from_value::<Table>(&tree).expect("reads"), Table::default());
    assert_eq!(
        from_value::<Table>(&Value::Null).expect("reads"),
        Table::default()
    );
    // A tuple takes the same path, so an empty one is too short for it.
    assert!(from_value::<(u8, u8)>(&Value::Null).is_err());
    assert!(from_value::<Pair>(&Value::Null).is_err());
    // The non-null spellings still read through the same methods.
    let pair = parse("[1, 2]\n").expect("parses").into_tree();
    assert_eq!(from_value::<Pair>(&pair).expect("reads"), Pair(1, 2));
    assert_eq!(from_value::<(u8, u8)>(&pair).expect("reads"), (1, 2));
}
