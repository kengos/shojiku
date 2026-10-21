//! Resolution into the key catalog: a page's declared shapes as a JSON
//! Schema fragment, and a fragment selector as the catalog node(s) it names.
//!
//! **A fragment is an ENUMERATION, not a lookup.** A bare key is genuinely
//! ambiguous on five of the pages — `table#style` names a property of five
//! different shapes — so a bare `#<key>` answers with EVERY match on that
//! page, each naming its owning shape, and `#<Shape>` / `#<Shape>.<prop>`
//! narrow. Never wrong, no disambiguation round trip, and it degrades to
//! exactly one node on the pages where a key is unique.
//!
//! **A page's `$defs` cannot resolve its own `$ref`s, by construction.** The
//! catalog's nodes cross-reference each other as `#/$defs/<Name>`, and the
//! page→shape map is an exact PARTITION — so a referenced shape is always
//! owned by some other page (`box`'s `OptBox.width` points at `Length`,
//! which `length` owns). Inlining the transitive closure is the wrong fix:
//! it is what makes a page read cost 60 KiB instead of 20, and it would
//! copy one node into a dozen pages. The rule is stated instead, in the
//! document itself ([`REF_RESOLUTION`], carried as `$comment`) and in the
//! two places a client meets the surface — `list_reference`'s `howToRead`
//! and the `get_reference` descriptor.

use super::Page;
use serde_json::{Map, Value, json};
use std::sync::OnceLock;

/// Where a `#/$defs/<Name>` pointer resolves. Rides every schema fragment
/// as `$comment`, because the document is the one place a client is
/// guaranteed to be looking when it meets a pointer it cannot follow.
pub(crate) const REF_RESOLUTION: &str = "A `$ref` of the form `#/$defs/<Name>` \
     is not resolvable inside this document: each reference page carries only the \
     shapes it documents. It resolves at `shojiku://reference/<page>#<Name>`, and \
     the `shapes` list in the list_reference response is the table saying which \
     page owns which name.";

/// One resolved node: the catalog subtree plus where it was found.
pub(crate) struct Match {
    /// The `$defs` shape the node belongs to.
    pub(crate) shape: String,
    /// The property name, when the selector named one rather than a whole
    /// shape.
    pub(crate) key: Option<String>,
    /// The catalog subtree itself.
    pub(crate) schema: Value,
}

impl Match {
    /// The wire form: the node beside the address that found it.
    fn to_value(&self) -> Value {
        let mut item = json!({ "shape": self.shape, "schema": self.schema });
        if let Some(key) = &self.key {
            item["key"] = json!(key);
        }
        item
    }
}

/// The parsed key catalog, built once.
fn schema() -> &'static Value {
    static SCHEMA: OnceLock<Value> = OnceLock::new();
    SCHEMA.get_or_init(|| parse(shojiku_authoring::reference::CATALOG))
}

/// Parses the catalog document.
///
/// A catalog it cannot read degrades to an empty document rather than
/// panicking: every page then serves its markdown half with no schema
/// half, which is poorer but not broken. Unreachable against the committed
/// artifact — `super::tests` pins that every declared shape resolves — so
/// it is proven directly instead.
fn parse(source: &str) -> Value {
    serde_json::from_str::<Value>(source)
        .ok()
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({}))
}

/// One `$defs` node by name.
fn shape(name: &str) -> Option<&'static Value> {
    schema().get("$defs")?.get(name)
}

/// The page's declared shapes as a JSON Schema fragment.
///
/// Always emitted, including as an empty `$defs` for the pages that declare
/// none: the contents array's shape must not depend on which page was
/// asked for, and "the catalog names no shape here" is itself an answer.
/// The `$comment` carries [`REF_RESOLUTION`] — see this module's header for
/// why a page cannot resolve its own pointers.
pub(crate) fn defs(page: &Page) -> Value {
    let mut defs = Map::new();
    for name in &page.shapes {
        if let Some(node) = shape(name) {
            defs.insert(name.clone(), node.clone());
        }
    }
    json!({ "$comment": REF_RESOLUTION, "$defs": Value::Object(defs) })
}

/// The union shape whose `oneOf` branches are the item types.
const ITEM_UNION: &str = "Item";

/// Every node on `page` that `fragment` names, in the page's declared shape
/// order. Empty = the selector names nothing here.
///
/// The grammar is the annotation layer's: a shape, then segments that are each
/// a property of the node in hand or — where the node is a tagged union — the
/// discriminator selecting one of its `oneOf` branches. So `Item.image` is the
/// image branch and `Item.image.fit` one of its keys.
///
/// An ITEM page declares no shape of its own (its keys live on a branch of
/// `Item`, owned by the template page), so it also answers for the branch named
/// like itself: `image#fit` and `image#Item.image` resolve there.
pub(crate) fn resolve(page: &Page, fragment: &str) -> Vec<Match> {
    if let Some(node) = page.shapes.iter().find(|s| *s == fragment) {
        return shape(node)
            .map(|schema| Match {
                shape: node.clone(),
                key: None,
                schema: schema.clone(),
            })
            .into_iter()
            .collect();
    }
    let tail: Vec<&str> = fragment.split('.').collect();
    if tail.len() > 1 {
        let root = tail[0];
        let owned = page.shapes.iter().any(|s| s == root)
            || (page.group == "item" && root == ITEM_UNION && tail.get(1) == Some(&page.stem));
        return if owned {
            walk(root, &tail[1..]).into_iter().collect()
        } else {
            Vec::new()
        };
    }
    let mut found: Vec<Match> = page
        .shapes
        .iter()
        .filter_map(|s| property(s, fragment))
        .collect();
    if page.group == "item" {
        found.extend(walk(ITEM_UNION, &[page.stem, fragment]));
    }
    found
}

/// One shape's named property, as a match.
///
/// Properties only: a bare key never reaches into a union's branches, which
/// would make `template#image` answer with the whole image branch.
fn property(shape_name: &str, key: &str) -> Option<Match> {
    let node = shape(shape_name)?.get("properties")?.get(key)?;
    Some(Match {
        shape: shape_name.to_string(),
        key: Some(key.to_string()),
        schema: node.clone(),
    })
}

/// Follows `tail` from the named shape: a property of the node in hand, else
/// the `oneOf` branch whose discriminator is that segment. A property ends the
/// path (it is the key); a branch extends the shape's address.
fn walk(shape_name: &str, tail: &[&str]) -> Option<Match> {
    let mut node = shape(shape_name)?;
    let mut address = shape_name.to_string();
    let mut key = None;
    for segment in tail {
        if key.is_some() {
            return None;
        }
        if let Some(properties) = node.get("properties") {
            node = properties.get(*segment)?;
            key = Some((*segment).to_string());
        } else {
            node = node
                .get("oneOf")?
                .as_array()?
                .iter()
                .find(|branch| selects(branch, segment))?;
            address = format!("{address}.{segment}");
        }
    }
    Some(Match {
        shape: address,
        key,
        schema: node.clone(),
    })
}

/// Whether a branch's discriminator is pinned to `name`.
fn selects(branch: &Value, name: &str) -> bool {
    branch["properties"]["type"]["const"].as_str() == Some(name)
}

/// The `resources/read` body for a fragment: the matches, each addressed.
pub(crate) fn matches_body(page: &Page, fragment: &str, matches: &[Match]) -> Value {
    json!({
        "page": page.stem,
        "fragment": fragment,
        "matches": matches.iter().map(Match::to_value).collect::<Vec<_>>(),
    })
}

#[cfg(test)]
mod tests;
