//! The completeness gate itself, over the two COMMITTED files.
//!
//! `docs/agents/engine.md` § The key catalog calls for two gates. The first —
//! regenerate and diff — is `regenerated.rs`. This is the second: every
//! artifact node has an annotation and every annotation names a real node.
//! It reads embedded bytes only, so it runs in the default suite and the
//! workspace coverage gate sees it.

mod synthetic;

use crate::reference::annotations::{
    anonymous, anonymous_branches, audit, branches, closed_union, closed_values, literal_values,
    nodes, parse,
};
use crate::reference::{ANNOTATIONS, CATALOG};
use serde_json::Value;

fn catalog() -> Value {
    serde_json::from_str(CATALOG).expect("the committed catalog is valid JSON")
}

fn annotations() -> std::collections::BTreeMap<String, String> {
    parse(ANNOTATIONS).expect("the committed annotation file is a flat node-to-prose map")
}

/// The gate. A key added to the wire arrives un-annotated and is named here.
#[test]
fn every_catalog_node_is_annotated_and_every_annotation_names_a_node() {
    let problems = audit(&catalog(), &annotations());
    let rendered: Vec<String> = problems.iter().map(ToString::to_string).collect();
    assert!(
        problems.is_empty(),
        "{} node(s) disagree between the catalog and \
         engine/authoring/reference/annotations/en.yml:\n  {}",
        problems.len(),
        rendered.join("\n  ")
    );
}

/// The gate above cannot see a DUPLICATE key: the later text silently wins and
/// the node still has an annotation, so nothing is missing. The first text is
/// simply lost. Comparing the parsed map against the file's own column-zero
/// keys is what catches it.
#[test]
fn the_annotation_file_carries_no_duplicate_key() {
    let written = ANNOTATIONS
        .lines()
        .filter(|line| line.starts_with(|c: char| c.is_ascii_alphabetic()) && line.contains(':'))
        .count();
    assert_eq!(
        annotations().len(),
        written,
        "a duplicate top-level key silently drops the first annotation"
    );
}

/// The other direction the gate cannot check: that the prose actually REACHED
/// the artifact, unaltered. Together with the drift gate this is what says the
/// merge is faithful — and it is the replacement for the old assertion that no
/// `description` survives at all, which the annotation layer falsifies.
#[test]
fn every_description_in_the_artifact_is_exactly_its_annotation() {
    let doc = catalog();
    let annotations = annotations();
    let defs = doc["$defs"].as_object().expect("the catalog carries $defs");
    for node in nodes(&doc) {
        let mut segments = node.split('.');
        let shape = segments.next().expect("a node names a shape");
        let mut schema = &defs[shape];
        for segment in segments {
            schema = schema
                .get("properties")
                .and_then(|props| props.get(segment))
                .or_else(|| {
                    branches(schema)
                        .into_iter()
                        .find(|(name, _)| name == segment)
                        .map(|(_, branch)| branch)
                })
                .or_else(|| {
                    anonymous(schema)
                        .into_iter()
                        .find_map(|branch| branch.get("properties")?.get(segment))
                })
                .unwrap_or_else(|| panic!("`{node}` addresses nothing in the catalog"));
        }
        assert_eq!(
            schema.get("description").and_then(Value::as_str),
            annotations.get(&node).map(String::as_str),
            "`{node}` carries prose the annotation file did not author"
        );
    }
}

/// The node set covers the tagged unions, which is where the 15 item types and
/// the two body kinds live — and where a set built from named shapes alone is
/// complete and empty at the same time.
///
/// It reaches into both corners an earlier grammar excluded: a branch's own
/// `type` key, and the keys of a branch with no discriminator (`PageSize`'s
/// `{ w, h }`, `PointSpec`'s two forms), which are addressed through the shape.
/// The anonymous-branch numbers are pinned so a new object form of a value
/// shape is a visible change rather than one more address through the shape.
#[test]
fn the_node_set_reaches_into_the_tagged_unions() {
    let doc = catalog();
    assert_eq!(nodes(&doc).len(), 457, "annotatable nodes");
    for node in [
        "Item.text",
        "Item.text.data",
        "Item.text.type",
        "Item.table.columns",
        "Item.char_grid.grid",
        "Body.flow",
        "Body.flow.gap",
        "Body.flow.type",
        "PageSize.w",
        "PointSpec.item",
        "BorderWidth.top",
        "TextCombineUpright.digits",
    ] {
        assert!(
            nodes(&doc).iter().any(|n| n == node),
            "`{node}` is a node the unions own"
        );
    }
    assert_eq!(
        anonymous_branches(&doc),
        (7, 20),
        "branches with no discriminator, and the keys they hold"
    );
    // The flat spelling is only unambiguous while no shape carries both.
    let ambiguous: Vec<&String> = doc["$defs"]
        .as_object()
        .expect("$defs")
        .iter()
        .filter(|(_, s)| s.get("oneOf").is_some() && s.get("properties").is_some())
        .map(|(name, _)| name)
        .collect();
    assert_eq!(ambiguous, Vec::<&String>::new());
}

/// The other half of the retired prose test: nothing OUTSIDE the node set
/// carries prose either.
///
/// `every_description_in_the_artifact_is_exactly_its_annotation` walks the
/// nodes, so it can only see the slots it already knows about — a description
/// on a subschema the node grammar does not name would be invisible to it, and
/// the assertion it replaced (no `description` anywhere in `$defs`) did cover
/// that. Counting both sides restores it: the artifact carries exactly as many
/// descriptions as there are nodes, so there is nowhere for a stray one to be.
#[test]
fn no_description_survives_outside_the_node_set() {
    fn descriptions(node: &Value) -> usize {
        match node {
            Value::Object(map) => map
                .iter()
                .map(|(key, value)| {
                    usize::from(key == "description" && value.is_string()) + descriptions(value)
                })
                .sum(),
            Value::Array(items) => items.iter().map(descriptions).sum(),
            _ => 0,
        }
    }
    let doc = catalog();
    assert_eq!(
        descriptions(&doc["$defs"]),
        nodes(&doc).len(),
        "a description sits somewhere the node grammar does not name"
    );
}

/// The claim the release notes make, asserted over the artifact itself rather
/// than over the node grammar: every key an author can write — every entry of
/// every `properties` map, anywhere in the document, the two roots included —
/// carries a description.
///
/// The audit above is only as complete as the grammar that lists its nodes,
/// and that grammar once skipped 37 keys by design. This walk knows nothing
/// about shapes or branches, so a key in a corner the grammar does not reach
/// is named here instead of shipping undescribed.
#[test]
fn every_property_in_the_catalog_carries_a_description() {
    fn undescribed(node: &Value, path: &str, out: &mut Vec<String>) {
        match node {
            Value::Object(map) => {
                for (key, value) in map {
                    let here = format!("{path}/{key}");
                    if key != "properties" {
                        undescribed(value, &here, out);
                        continue;
                    }
                    // A `properties` map is keyed by WIRE names, and one of
                    // them is literally `properties`, so each value is walked
                    // as a schema rather than the map itself.
                    for (name, property) in value.as_object().into_iter().flatten() {
                        let text = property.get("description").and_then(Value::as_str);
                        if text.is_none_or(|t| t.trim().is_empty()) {
                            out.push(format!("{here}/{name}"));
                        }
                        undescribed(property, &format!("{here}/{name}"), out);
                    }
                }
            }
            Value::Array(items) => {
                for (at, item) in items.iter().enumerate() {
                    undescribed(item, &format!("{path}/{at}"), out);
                }
            }
            _ => {}
        }
    }
    let mut missing = Vec::new();
    undescribed(&catalog(), "", &mut missing);
    assert_eq!(
        missing,
        Vec::<String>::new(),
        "catalog keys with no description"
    );
}

/// The strip still runs. schemars lifts Rust doc comments into BOTH slots, and
/// only `description` is now legitimately occupied — a surviving `title` means
/// developer prose came through with it.
#[test]
fn no_developer_title_survives_into_the_shapes() {
    fn titles(node: &Value) -> usize {
        match node {
            Value::Object(map) => map
                .iter()
                .map(|(key, value)| {
                    usize::from(key == "title" && value.is_string()) + titles(value)
                })
                .sum(),
            Value::Array(items) => items.iter().map(titles).sum(),
            _ => 0,
        }
    }
    assert_eq!(titles(&catalog()["$defs"]), 0);
    // The document's own title is hand-written and stays.
    assert!(catalog()["title"].is_string());
}

/// `Option<serde_json::Value>` derives as the boolean schema `true`, which has
/// nowhere to put prose. The merge upgrades it to the equivalent `{}` so the
/// key is not the one an author can never read about.
#[test]
fn the_boolean_schema_node_became_an_object_carrying_its_prose() {
    let doc = catalog();
    let node = &doc["$defs"]["Schema"]["properties"]["recommendedStyle"];
    assert!(
        node.is_object(),
        "recommendedStyle derives as the boolean schema `true`; the merge \
         must upgrade it to the equivalent empty object"
    );
    assert!(node["description"].is_string());
    // It is the only node of its kind — a second one appearing is a design
    // input, not something to absorb silently.
    let booleans: Vec<String> = doc["$defs"]
        .as_object()
        .expect("$defs")
        .iter()
        .flat_map(|(shape, schema)| {
            schema
                .get("properties")
                .and_then(Value::as_object)
                .into_iter()
                .flatten()
                .filter(|(_, v)| v.is_boolean())
                .map(move |(key, _)| format!("{shape}.{key}"))
        })
        .collect();
    assert_eq!(booleans, Vec::<String>::new());
}

/// The closed-value clause is only worth something if it actually covers the
/// shapes it claims. Enumerating from the artifact — rather than hard-coding
/// the list — is what puts a NEW closed enum under the clause automatically;
/// the count is asserted so a shape silently leaving the set is visible.
/// The clause is only worth something if it covers the shapes it claims, so
/// both populations are enumerated from the artifact rather than hard-coded —
/// a new one joins automatically, and one that leaves is visible.
///
/// The two numbers are different populations on purpose. A CLOSED set is a
/// completeness claim ("these are all the values"); the LITERALS a shape
/// accepts are a prose obligation, and a union that also takes a non-literal
/// form still owes them. Keying the clause on the closed set left `PageSize`
/// — eight named papers or a `{ w, h }` map — describing its names as "the ISO
/// A series", which invites `A2`.
#[test]
fn the_value_sets_are_enumerated_from_the_artifact() {
    let doc = catalog();
    let defs = doc["$defs"].as_object().expect("$defs");
    let count = |f: fn(&Value) -> Option<Vec<String>>| -> (usize, usize) {
        let found: Vec<usize> = defs
            .values()
            .filter_map(|s| f(s).map(|v| v.len()))
            .collect();
        (found.len(), found.iter().sum())
    };
    let closed = count(|s| closed_values(s).or_else(|| closed_union(s)));
    assert_eq!(
        closed,
        (32, 97),
        "shapes whose value set is CLOSED, and values"
    );
    let literal = count(literal_values);
    assert_eq!(
        literal,
        (36, 109),
        "shapes carrying literals at all — the clause's real population"
    );
    for name in [
        "TextAlign",
        "AlignItems",
        "FlexBasis",
        "BoxType",
        "PageSize",
    ] {
        assert!(
            literal_values(&defs[name]).is_some(),
            "{name} carries literals the prose owes"
        );
    }
}
