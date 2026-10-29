//! The engine's fact tables, written into the catalog as JSON Schema
//! keywords so a reader of the artifact — the Designer's generic property
//! panel, an agent — learns them from the same document as the shapes.
//!
//! Standard keywords where JSON Schema has one and means the same thing
//! (`minimum`, `exclusiveMinimum`, `maximum`); `x-shojiku-*` extensions for
//! the rest, which a validator ignores:
//!
//! - `x-shojiku-initial` on each `Style.<key>` and `LineStyle.<key>`, and on
//!   a list's `overflowText`. NOT
//!   `default`: a form generator writes a `default` into the document, and a
//!   written `fontSize: 10` would stop the key inheriting — or, on a key an
//!   older engine lacks, be refused at parse;
//! - `x-shojiku-inherited` on each `Style.<key>`;
//! - `x-shojiku-initial-overrides` on a surface that starts a key somewhere
//!   else (a form mark's 1pt outline, a table's middle-aligned cells; `null`
//!   where the surface derives it, as a character grid sizes its glyphs from
//!   the cell);
//! - `x-shojiku-style-keys` on each surface that takes a `style:` — the keys
//!   that change its output, painted or inherited into what it holds;
//! - `x-shojiku-holds-content` on the surfaces whose style cascades into
//!   children or cells;
//! - `x-shojiku-ref` on a value that names something defined elsewhere in
//!   the template or its data ([`refs`]); on a name-or-inline-map shape
//!   (`FormatRef`) it is the string form that is the reference;
//! - `x-shojiku-capability` on a node an older engine may not carry
//!   ([`capabilities`]);
//! - `x-shojiku-value-kind` on a value whose meaning its JSON type does not
//!   carry — a colour string, a 0–1 fraction ([`kinds`]);
//! - `x-shojiku-form` on the two forms of a line endpoint, so a panel can
//!   offer the choice between them.
//!
//! The ranges are guard bounds, not parse rules: the engine warns and falls
//! back rather than refusing a document, so the schema is NARROWER than the
//! parser there — the direction that never teaches a rejected input.

use serde_json::{Map, Value, json};
use shojiku_core::facts::{self, ScalarRange, Surface};
use shojiku_core::{ItemKind, StyleKey};

pub mod capabilities;
pub mod kinds;
pub mod refs;
#[cfg(test)]
mod tests;

/// One keyword to write onto one node.
#[derive(Debug, Clone, PartialEq)]
pub struct Extension {
    /// The node's address, in [`super::address`]'s grammar.
    pub node: String,
    pub keyword: &'static str,
    pub value: Value,
}

fn ext(node: impl Into<String>, keyword: &'static str, value: Value) -> Extension {
    Extension {
        node: node.into(),
        keyword,
        value,
    }
}

/// Every keyword the fact tables put into `catalog`.
pub fn extensions(catalog: &Value) -> Vec<Extension> {
    let mut out = Vec::new();
    for key in facts::keys() {
        let node = format!("Style.{}", key.as_str());
        out.push(ext(
            &node,
            "x-shojiku-inherited",
            json!(facts::inherits(key)),
        ));
        if let Some(value) = facts::initial(key) {
            out.push(ext(&node, "x-shojiku-initial", value.to_json()));
        }
        if let Some(range) = facts::range(key) {
            bounds(&mut out, &node, range);
        }
    }
    for (key, value) in facts::line_initial() {
        out.push(ext(
            format!("LineStyle.{key}"),
            "x-shojiku-initial",
            value.to_json(),
        ));
    }
    bounds(&mut out, "LineStyle.width", facts::LINE_WIDTH);
    bounds(&mut out, "LineStyle.opacity", facts::OPACITY);
    out.push(ext(
        "Item.list.overflowText",
        "x-shojiku-initial",
        json!(facts::LIST_OVERFLOW_TEXT),
    ));
    for (node, surface) in styled_nodes() {
        let keys: Vec<&str> = facts::keys()
            .filter(|key| facts::takes(surface, *key))
            .map(StyleKey::as_str)
            .collect();
        out.push(ext(&node, "x-shojiku-style-keys", json!(keys)));
        if facts::holds_content(surface) {
            out.push(ext(&node, "x-shojiku-holds-content", json!(true)));
        }
        let overrides: Map<String, Value> = facts::keys()
            .filter_map(|key| {
                let value = facts::surface_initial(surface, key)?;
                Some((key.as_str().to_string(), value.to_json()))
            })
            .collect();
        if !overrides.is_empty() {
            out.push(ext(
                &node,
                "x-shojiku-initial-overrides",
                Value::Object(overrides),
            ));
        }
    }
    for (node, kind) in refs::references(catalog) {
        out.push(ext(node, "x-shojiku-ref", json!(kind.as_str())));
    }
    for (node, kind) in kinds::NAMED {
        out.push(ext(node, "x-shojiku-value-kind", json!(kind.as_str())));
    }
    for (node, key) in capabilities::gated(catalog) {
        out.push(ext(node, "x-shojiku-capability", Value::String(key)));
    }
    out.push(ext("PointSpec.@x", "x-shojiku-form", json!("point")));
    out.push(ext("PointSpec.@item", "x-shojiku-form", json!("anchor")));
    out
}

/// Writes each extension onto the node it names, and returns the addresses
/// that named no node — empty for a catalog the tables agree with.
pub fn merge(defs: &mut Map<String, Value>, extensions: &[Extension]) -> Vec<String> {
    let mut missing = Vec::new();
    for e in extensions {
        match super::address::locate(defs, &e.node).and_then(Value::as_object_mut) {
            Some(node) => {
                node.insert(e.keyword.to_string(), e.value.clone());
            }
            None => missing.push(e.node.clone()),
        }
    }
    missing
}

/// The catalog nodes that carry a `style:` the tables cover, and the surface
/// each is. A repeat's cell and a repeat_flow's item are containers in their
/// own shape. A table's own layers (`Column`, `RowSpec`, `HeaderGroup`, …)
/// are not covered yet, so they carry no keyword.
fn styled_nodes() -> Vec<(String, Surface)> {
    let items = ItemKind::ALL
        .into_iter()
        .filter(|kind| facts::keys().any(|key| facts::takes(Surface::Item(*kind), key)))
        .map(|kind| (format!("Item.{}", kind.as_str()), Surface::Item(kind)));
    items
        .chain([
            (
                "ContainerItem".to_string(),
                Surface::Item(ItemKind::Container),
            ),
            ("Span".to_string(), Surface::Span),
            ("TextMark".to_string(), Surface::Mark),
            ("TemplateDefaults.style".to_string(), Surface::Document),
        ])
        .collect()
}

fn bounds(out: &mut Vec<Extension>, node: &str, range: ScalarRange) {
    let min = if range.min_exclusive {
        "exclusiveMinimum"
    } else {
        "minimum"
    };
    out.push(ext(node, min, json!(range.min)));
    out.push(ext(node, "maximum", json!(range.max)));
}
