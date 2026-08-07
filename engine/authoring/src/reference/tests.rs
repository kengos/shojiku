//! Tests over the committed catalog.
//!
//! Deliberately split by what they need. Everything that is a claim ABOUT
//! THE ARTIFACT reads the embedded [`CATALOG`] bytes, so it runs in the
//! default test suite and is covered by the workspace coverage gate.
//! Only the two claims about REGENERATION need the `schema` feature, and
//! those live at the bottom.

use super::CATALOG;
use serde_json::Value;
use std::collections::BTreeSet;

fn catalog() -> Value {
    serde_json::from_str(CATALOG).expect("the committed catalog is valid JSON")
}

fn defs(doc: &Value) -> &serde_json::Map<String, Value> {
    doc["$defs"].as_object().expect("the catalog carries $defs")
}

/// Collects every `$ref` target in the document.
fn refs(node: &Value, out: &mut Vec<String>) {
    match node {
        Value::Object(map) => {
            for (key, value) in map {
                if key == "$ref" {
                    if let Some(target) = value.as_str() {
                        out.push(target.to_string());
                    }
                }
                refs(value, out);
            }
        }
        Value::Array(items) => items.iter().for_each(|item| refs(item, out)),
        _ => {}
    }
}

/// Counts `description`/`title` used as a SCHEMA KEYWORD — i.e. with a
/// string value. Three wire keys are literally NAMED `description`
/// (`definitions.description`, `document.description`, a definitions field's
/// own `description`), and those appear as property names with a subschema
/// value; counting by key name alone reports them as prose.
fn prose_nodes(node: &Value) -> usize {
    match node {
        Value::Object(map) => map
            .iter()
            .map(|(key, value)| {
                let own = usize::from(
                    matches!(key.as_str(), "description" | "title") && value.is_string(),
                );
                own + prose_nodes(value)
            })
            .sum(),
        Value::Array(items) => items.iter().map(prose_nodes).sum(),
        _ => 0,
    }
}

/// Walks TRANSITIVELY from one root, following each `$ref` into `$defs`, and
/// returns the shape names reached. Panics on a target that has no `$defs`
/// entry — a dangling `$ref` is the failure both root tests exist to catch.
///
/// Transitive on purpose: a walk that merely scanned every `$ref` in the
/// document would pass for either root regardless of which shapes that root
/// actually reaches, making the two tests one test written twice.
fn reachable_from(doc: &Value, root: &str) -> BTreeSet<String> {
    let names = defs(doc);
    let mut seen = BTreeSet::new();
    let mut queue = Vec::new();
    refs(&doc["properties"][root], &mut queue);
    while let Some(target) = queue.pop() {
        let name = target.rsplit('/').next().unwrap_or_default().to_string();
        assert!(
            names.contains_key(&name),
            "dangling $ref `{target}` reached from the `{root}` root — \
             no `{name}` in $defs"
        );
        if seen.insert(name.clone()) {
            refs(&names[&name], &mut queue);
        }
    }
    seen
}

#[test]
fn the_template_root_resolves_every_ref_it_reaches() {
    let doc = catalog();
    let reached = reachable_from(&doc, "template");
    // The geometry types are the ones a per-area derive would have missed,
    // leaving a dangling $ref at every `box:`.
    for shape in ["Item", "Style", "OptBox", "PageSpec", "Length"] {
        assert!(
            reached.contains(shape),
            "the template root never reaches {shape}"
        );
    }
}

#[test]
fn the_definitions_root_resolves_every_ref_it_reaches() {
    let doc = catalog();
    let reached = reachable_from(&doc, "definitions");
    for shape in ["Schema", "EnumEntry"] {
        assert!(
            reached.contains(shape),
            "the definitions root never reaches {shape}"
        );
    }
    // The two roots are genuinely different documents, not one walk twice.
    assert!(
        !reached.contains("Item"),
        "definitions must not reach template items"
    );
}

/// The wire's recursion — an `Item` may be a container whose children are
/// `Item`s — must be emitted as a `$ref` into `$defs`, never inlined.
/// Inlined, generation would not terminate and any consumer would read an
/// infinite document.
#[test]
fn the_recursive_item_shape_is_a_ref_not_an_inline_copy() {
    let doc = catalog();
    assert!(defs(&doc).contains_key("Item"), "Item is a named shape");
    let container = &defs(&doc)["ContainerItem"];
    let mut targets = Vec::new();
    refs(&container["properties"]["items"], &mut targets);
    assert!(
        targets.iter().any(|t| t.ends_with("/Item")),
        "a container's children must $ref Item, got {targets:?}"
    );
}

/// `deny_unknown_fields` is on EVERY wire struct, so every named object
/// shape in the catalog must be closed. A catalog describing a closed struct
/// as open teaches an agent to emit keys the parser rejects — so this
/// enumerates rather than pinning one shape, and names any that drifts.
#[test]
fn every_named_object_shape_is_closed() {
    let doc = catalog();
    let open: Vec<&str> = defs(&doc)
        .iter()
        .filter(|(_, shape)| shape.get("properties").is_some())
        .filter(|(_, shape)| shape.get("additionalProperties") != Some(&Value::Bool(false)))
        .map(|(name, _)| name.as_str())
        .collect();
    assert!(
        open.is_empty(),
        "every wire struct is deny_unknown_fields, but the catalog leaves \
         these open: {open:?}"
    );
}

/// Unset never serializes, so an `Option` + `skip_serializing_if` key is
/// optional on the wire and must not appear in `required` — while a key the
/// parser genuinely demands must. `Binding` carries both halves.
#[test]
fn required_lists_the_demanded_keys_and_only_those() {
    let doc = catalog();
    let binding = &defs(&doc)["Binding"];
    let required = binding["required"].as_array().cloned().unwrap_or_default();
    assert!(
        required.iter().any(|r| r == "key"),
        "`key` is the one key a binding must carry"
    );
    for optional in ["format", "placeholder", "scope"] {
        assert!(
            binding["properties"].get(optional).is_some(),
            "Binding declares `{optional}`"
        );
        assert!(
            !required.iter().any(|r| r == optional),
            "`{optional}` is optional on the wire but the catalog demands it"
        );
    }
}

/// A closed enum must enumerate exactly what the parser accepts — absence
/// is information, which is the whole reason the format was chosen. So the
/// listed values are checked BOTH ways: each one parses, and a plausible
/// fourth spelling does not. Listing the three without the second clause
/// would pass over a catalog that had quietly gained a fourth.
#[test]
fn a_closed_enum_lists_exactly_the_accepted_values() {
    let doc = catalog();
    let values = defs(&doc)["TextAlign"]["enum"]
        .as_array()
        .expect("TextAlign is a closed enum")
        .iter()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect::<Vec<_>>();
    assert_eq!(values, ["left", "center", "right"]);

    for value in &values {
        assert!(
            serde_json::from_str::<shojiku_core::TextAlign>(&format!("\"{value}\"")).is_ok(),
            "the catalog lists `{value}` but the parser refuses it"
        );
    }
    // CSS has `justify`; this engine does not, and the catalog must not
    // suggest otherwise by omission being unverified.
    assert!(serde_json::from_str::<shojiku_core::TextAlign>("\"justify\"").is_err());
}

/// The catalog carries STRUCTURE. Node-local prose belongs to the
/// annotation layer — authored per locale and gated by "every node has an
/// annotation" — and pre-filling it with Rust doc comments would make that
/// gate pass vacuously against text nobody wrote for authors.
#[test]
fn no_developer_prose_survives_into_the_shapes() {
    let doc = catalog();
    assert_eq!(prose_nodes(&doc["$defs"]), 0);
    // The document's own title/description are hand-written and stay.
    assert!(doc["title"].is_string());
    assert!(doc["description"].is_string());
}

#[cfg(feature = "schema")]
mod regenerated;
