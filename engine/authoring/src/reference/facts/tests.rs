//! The fact keywords against the committed catalog: every address names a
//! real node, every capability is declared, every reference-shaped node is
//! classified, and a sample of the written values is what the tables say.

use super::*;
use crate::reference::annotations::nodes;
use crate::reference::CATALOG;
use crate::CAPABILITIES;
use std::collections::BTreeSet;

fn catalog() -> Value {
    serde_json::from_str(CATALOG).expect("the committed catalog parses")
}

/// The catalog with the fact keywords merged in, and what failed to land.
fn merged() -> (Value, Vec<String>) {
    let mut catalog = catalog();
    let extensions = extensions(&catalog);
    let defs = catalog["$defs"].as_object_mut().expect("$defs");
    let missing = merge(defs, &extensions);
    (catalog, missing)
}

fn def<'a>(catalog: &'a Value, shape: &str) -> &'a Value {
    &catalog["$defs"][shape]
}

fn branch<'a>(catalog: &'a Value, kind: &str) -> &'a Value {
    def(catalog, "Item")["oneOf"]
        .as_array()
        .expect("Item is a oneOf")
        .iter()
        .find(|b| b["properties"]["type"]["const"] == kind)
        .expect("the kind has a branch")
}

#[test]
fn every_extension_lands_on_a_node() {
    let (_, missing) = merged();
    assert!(missing.is_empty(), "no node for {missing:?}");
}

#[test]
fn an_unknown_address_is_reported_not_written() {
    let mut catalog = catalog();
    let defs = catalog["$defs"].as_object_mut().expect("$defs");
    let unknown = [
        ext("Nope.fontSize", "default", json!(1)),
        ext("Style.@fontSize", "default", json!(1)),
    ];
    assert_eq!(merge(defs, &unknown), ["Nope.fontSize", "Style.@fontSize"]);
}

#[test]
fn style_keys_carry_inheritance_defaults_and_bounds() {
    let (catalog, _) = merged();
    let font_size = &def(&catalog, "Style")["properties"]["fontSize"];
    assert_eq!(font_size["x-shojiku-initial"], json!(10.0));
    assert!(
        font_size.get("default").is_none(),
        "a default would stop inheritance"
    );
    assert_eq!(font_size["exclusiveMinimum"], json!(0.0));
    assert_eq!(font_size["maximum"], json!(1000.0));
    assert_eq!(font_size["x-shojiku-inherited"], json!(true));
    let border = &def(&catalog, "Style")["properties"]["borderWidth"];
    assert_eq!(border["minimum"], json!(0.0));
    assert_eq!(border["x-shojiku-inherited"], json!(false));
    let family = &def(&catalog, "Style")["properties"]["fontFamily"];
    assert!(
        family.get("x-shojiku-initial").is_none(),
        "the font chain decides"
    );
    let width = &def(&catalog, "LineStyle")["properties"]["width"];
    assert_eq!(width["x-shojiku-initial"], json!(1.0));
    assert!(width.get("default").is_none());
    assert_eq!(width["maximum"], json!(1000.0));
}

#[test]
fn each_styled_surface_lists_the_keys_it_takes() {
    let (catalog, _) = merged();
    assert_eq!(
        branch(&catalog, "ellipse")["x-shojiku-style-keys"],
        json!(["backgroundColor", "borderWidth", "borderColor", "opacity"])
    );
    let container = branch(&catalog, "container");
    let keys = container["x-shojiku-style-keys"]
        .as_array()
        .expect("a list");
    assert!(keys.contains(&json!("fontSize")) && keys.contains(&json!("overflow")));
    assert!(!keys.contains(&json!("textDecoration")));
    assert_eq!(container["x-shojiku-holds-content"], json!(true));
    assert_eq!(
        def(&catalog, "ContainerItem")["x-shojiku-style-keys"],
        container["x-shojiku-style-keys"]
    );
    assert!(branch(&catalog, "line")
        .get("x-shojiku-style-keys")
        .is_none());
    assert!(branch(&catalog, "text")
        .get("x-shojiku-holds-content")
        .is_none());
    assert!(def(&catalog, "Span")["x-shojiku-style-keys"].is_array());
    assert!(def(&catalog, "TextMark")["x-shojiku-style-keys"].is_array());
}

#[test]
fn every_reference_shaped_node_is_classified() {
    let catalog = catalog();
    let all: BTreeSet<String> = nodes(&catalog).into_iter().collect();
    let refs: BTreeSet<String> = refs::references(&catalog)
        .into_iter()
        .map(|(n, _)| n)
        .collect();
    let excused: BTreeSet<String> = refs::NOT_REFERENCES
        .iter()
        .map(|(n, _)| (*n).to_string())
        .collect();
    for node in refs.iter().chain(&excused) {
        assert!(all.contains(node), "`{node}` is not a catalog node");
    }
    assert!(refs.is_disjoint(&excused));
    for node in &all {
        let last = node.rsplit('.').next().expect("a segment");
        if node.contains('.') && refs::REFERENCE_SHAPED.contains(&last) {
            assert!(
                refs.contains(node) || excused.contains(node),
                "`{node}` looks like a reference and is not classified"
            );
        }
    }
    // Every style-name list, found by name: 19 `styleNames` and one
    // `alternateStyleNames`.
    let style_lists = refs::references(&catalog)
        .iter()
        .filter(|(_, kind)| *kind == refs::RefKind::Style)
        .count();
    assert_eq!(style_lists, 20);
}

#[test]
fn references_and_forms_are_written_where_a_picker_reads_them() {
    let (catalog, _) = merged();
    let ellipse = branch(&catalog, "ellipse");
    assert_eq!(
        ellipse["properties"]["anchor"]["x-shojiku-ref"],
        json!("item")
    );
    let forms: Vec<&Value> = def(&catalog, "PointSpec")["oneOf"]
        .as_array()
        .expect("a oneOf")
        .iter()
        .map(|b| &b["x-shojiku-form"])
        .collect();
    assert_eq!(forms, [&json!("point"), &json!("anchor")]);
    let anchor = &def(&catalog, "PointSpec")["oneOf"][1];
    assert_eq!(anchor["properties"]["item"]["x-shojiku-ref"], json!("item"));
    assert_eq!(anchor["x-shojiku-capability"], json!("line.anchor"));
    assert_eq!(
        def(&catalog, "Binding")["properties"]["key"]["x-shojiku-ref"],
        json!("dataKey")
    );
    assert_eq!(def(&catalog, "FormatRef")["x-shojiku-ref"], json!("format"));
    let names = &branch(&catalog, "text")["properties"]["styleNames"];
    assert_eq!(names["x-shojiku-ref"], json!("style"));
    let kinds: BTreeSet<&str> = [
        refs::RefKind::Item,
        refs::RefKind::Style,
        refs::RefKind::Format,
        refs::RefKind::DataKey,
    ]
    .iter()
    .map(|k| k.as_str())
    .collect();
    assert_eq!(kinds.len(), 4);
}

#[test]
fn every_gated_node_names_a_declared_capability() {
    let catalog = catalog();
    let all: BTreeSet<String> = nodes(&catalog).into_iter().collect();
    let gated = capabilities::gated(&catalog);
    for (node, key) in &gated {
        // A `@<key>` form address is not a node name; the landing test
        // resolves it.
        assert!(
            node.contains('@') || all.contains(node),
            "`{node}` is not a catalog node"
        );
        assert!(
            CAPABILITIES.contains(&key.as_str()),
            "`{key}` is not declared"
        );
    }
    let (merged, _) = merged();
    assert_eq!(
        branch(&merged, "ellipse")["x-shojiku-capability"],
        json!("ellipse")
    );
    assert_eq!(
        def(&merged, "Style")["properties"]["opacity"]["x-shojiku-capability"],
        json!("style.opacity")
    );
    assert_eq!(
        branch(&merged, "text")["properties"]["visible"]["x-shojiku-capability"],
        json!("item.visible")
    );
    // `style.fontSize` is not a key: the size predates the registry.
    assert!(def(&merged, "Style")["properties"]["fontSize"]
        .get("x-shojiku-capability")
        .is_none());
}

/// Every declared capability is either gated on a node or listed as having
/// none, so a key added to the registry has to be placed.
#[test]
fn every_capability_is_gated_or_listed_as_nodeless() {
    let catalog = catalog();
    let gated: BTreeSet<String> = capabilities::gated(&catalog)
        .into_iter()
        .map(|(_, key)| key)
        .collect();
    let nodeless: BTreeSet<&str> = capabilities::UNGATED.iter().copied().collect();
    assert_eq!(
        nodeless.len(),
        capabilities::UNGATED.len(),
        "a key is listed twice"
    );
    for key in CAPABILITIES {
        assert!(
            gated.contains(*key) != nodeless.contains(key),
            "`{key}` must be gated on a node or listed as nodeless, not both or neither"
        );
    }
}

/// The two key sets the tables are keyed on, against the catalog the parser
/// generates: a `Style` field or an item type added without a key here reds.
#[test]
fn the_key_sets_match_the_catalog() {
    let catalog = catalog();
    let fields: BTreeSet<&str> = def(&catalog, "Style")["properties"]
        .as_object()
        .expect("Style has properties")
        .keys()
        .map(String::as_str)
        .collect();
    let keys: BTreeSet<&str> = StyleKey::ALL.iter().map(|k| k.as_str()).collect();
    assert_eq!(fields, keys);
    let types: Vec<&str> = def(&catalog, "Item")["oneOf"]
        .as_array()
        .expect("Item is a oneOf")
        .iter()
        .map(|b| b["properties"]["type"]["const"].as_str().expect("a type"))
        .collect();
    let kinds: Vec<&str> = ItemKind::ALL.iter().map(|k| k.as_str()).collect();
    assert_eq!(types, kinds, "in declaration order");
}

#[test]
fn surfaces_that_start_a_key_elsewhere_say_so() {
    let (catalog, _) = merged();
    assert_eq!(
        branch(&catalog, "ellipse")["x-shojiku-initial-overrides"],
        json!({ "borderWidth": 1.0 })
    );
    assert_eq!(
        branch(&catalog, "table")["x-shojiku-initial-overrides"],
        json!({ "borderWidth": 0.5, "verticalAlign": "middle" })
    );
    assert!(branch(&catalog, "text")
        .get("x-shojiku-initial-overrides")
        .is_none());
    let root = &def(&catalog, "TemplateDefaults")["properties"]["style"];
    assert_eq!(root["x-shojiku-holds-content"], json!(true));
    assert_eq!(
        root["x-shojiku-style-keys"]
            .as_array()
            .expect("a list")
            .len(),
        14,
        "the root takes exactly the inherited keys"
    );
}

#[test]
fn a_listed_pair_replaces_the_naming_rule_and_whole_families_are_gated() {
    let (catalog, _) = merged();
    let ellipse = branch(&catalog, "ellipse");
    assert_eq!(
        ellipse["properties"]["styleNames"]["x-shojiku-capability"],
        json!("style.shapes.unified")
    );
    assert_eq!(
        branch(&catalog, "text")["properties"]["styleNames"]["x-shojiku-capability"],
        json!("styleNames")
    );
    let line = &def(&catalog, "LineStyle")["properties"];
    assert_eq!(line["style"]["x-shojiku-capability"], json!("line.style"));
    assert!(
        line["width"].get("x-shojiku-capability").is_none(),
        "older than the key"
    );
    let gated = capabilities::gated(&catalog);
    let gated_by = |key: &str| -> BTreeSet<String> {
        gated
            .iter()
            .filter(|(_, k)| k == key)
            .map(|(n, _)| n.clone())
            .collect()
    };
    for node in ["OptBox.type", "OptBox.gap", "OptBox.direction"] {
        assert!(gated_by("box.flex").contains(node), "{node}");
    }
    for node in [
        "OptBox.columns",
        "OptBox.rows",
        "OptBox.columnGap",
        "OptBox.rowGap",
    ] {
        assert!(gated_by("box.grid").contains(node), "{node}");
    }
    let nodes: Vec<&String> = gated.iter().map(|(n, _)| n).collect();
    let distinct: BTreeSet<&String> = nodes.iter().copied().collect();
    assert_eq!(nodes.len(), distinct.len(), "a node is gated twice");
    let grid = branch(&catalog, "char_grid");
    assert_eq!(grid["x-shojiku-initial-overrides"]["fontSize"], Value::Null);
}
