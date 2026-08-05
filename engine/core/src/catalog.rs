//! A flattened, queryable view of `definitions` for validation/formatting.
//!
//! The flatten walk is the v1↔v2 compatibility keystone: the schema tree
//! reduces to the same dotted-key lookup tables the validator and the
//! formatter always consumed, so nothing downstream knows the wire shape
//! changed. Nested objects flatten to dotted scalar keys
//! (`receipt.number`); an array property registers as an [`ArrayGroup`]
//! under its dotted path, with its row fields keyed relative to one
//! element — and a row's own array child registers as a group of its own
//! under the joined path (`orders.items`), so a nested source is as
//! addressable as a top-level one.
//!
//! The walk is recursive and takes no depth argument: `MAX_SCHEMA_DEPTH`
//! is enforced at parse (`definitions::shape`), which bounds every walk
//! over a parsed schema — the same arrangement the template tree relies
//! on. Pinned by `nesting_at_the_parse_cap_flattens`.

use crate::definitions::{Definitions, FieldType};
use std::collections::{HashMap, HashSet};

mod flatten;
#[cfg(test)]
mod tests;

/// Everything the formatter/validator needs to know about one field.
#[derive(Debug, Clone)]
pub struct FieldSpec {
    pub field_type: FieldType,
    /// The field's own currency code override, if any. The document-level
    /// default lives in the template `defaults.currency` and is threaded
    /// to the formatter via `FormatContext` — the catalog never bakes it.
    pub currency: Option<String>,
    pub precision: Option<u32>,
    /// Semantic unit key (`item`, …); display words live in the pack.
    pub unit: Option<String>,
    /// The field's default display variant (precedence middle: beats the
    /// template per-type default, loses to the placement).
    pub format: Option<String>,
    /// Declared display variant ids (empty means "anything goes").
    pub formats: Vec<String>,
    /// The field's blank-form default: drawn when a binding to it resolves
    /// to an absent/`null`/`""` value. A placement's own `placeholder`
    /// beats it.
    pub placeholder: Option<String>,
    /// Display labels declared on the field's `enum` members, in authored
    /// order. Empty for every field type but plain text — the other types
    /// render through their own formatter (validation warns there).
    /// Matched by VALUE equality, exactly as enum membership is.
    pub enum_labels: Vec<(serde_json::Value, String)>,
    /// Every declared `enum` member's VALUE, in authored order, for EVERY
    /// field type — the closed set a template-side `equals` literal is
    /// checked against. Distinct from [`FieldSpec::enum_labels`], which is
    /// presentation and exists for plain text fields only.
    pub enum_values: Vec<serde_json::Value>,
}

/// What the schema says about ONE element of an array source.
#[derive(Debug, Clone)]
pub enum ArrayElement {
    /// `items:` declares an object — the element's fields are known, and
    /// live in the group's field table.
    Object,
    /// `items:` declares a scalar — one spec, no fields.
    Scalar(Box<FieldSpec>),
    /// No `items:`, or an element the catalog does not model (an array of
    /// arrays): the element shape is UNKNOWN, so every check that would
    /// read it stays silent rather than guessing.
    Undeclared,
}

/// One array source: what a `table` / `repeat` / `repeat_flow` / `list`
/// binds to. Reached only through [`Catalog`]'s accessors, never handed
/// out.
#[derive(Debug, Clone)]
pub(crate) struct ArrayGroup {
    /// Leaf fields of one element, keyed relative to it (nested row
    /// objects flatten to dotted relative keys).
    fields: HashMap<String, FieldSpec>,
    /// Row-relative keys that are themselves ARRAYS (a list inside a
    /// repeat cell). Each also registers as a group of its own under the
    /// joined dotted path.
    row_arrays: HashSet<String>,
    element: ArrayElement,
}

/// Lookup tables built from [`Definitions`].
#[derive(Debug, Clone, Default)]
pub struct Catalog {
    /// Scalar fields keyed by full dotted path (`order.code`).
    scalars: HashMap<String, FieldSpec>,
    /// Array sources keyed by full dotted path — top-level (`items`),
    /// nested in an object (`order.lines`), or carried by another array's
    /// rows (`orders.items`).
    arrays: HashMap<String, ArrayGroup>,
}

impl Catalog {
    pub fn from_definitions(defs: &Definitions) -> Self {
        let mut catalog = Catalog::default();
        for (name, schema) in &defs.properties {
            flatten::flatten(name.clone(), schema, &mut catalog);
        }
        catalog
    }

    /// Looks up a scalar field by full path.
    pub fn scalar(&self, key: &str) -> Option<&FieldSpec> {
        self.scalars.get(key)
    }

    /// Whether `key` names an array source.
    pub fn is_array(&self, key: &str) -> bool {
        self.arrays.contains_key(key)
    }

    /// Looks up a field inside an array source by row-relative key.
    pub fn array_field(&self, array_key: &str, field_key: &str) -> Option<&FieldSpec> {
        self.arrays.get(array_key)?.fields.get(field_key)
    }

    /// Whether `field_key` is a declared row-relative ARRAY of the source
    /// (a list bound inside its cell/card). The nested source itself is
    /// registered under `<array_key>.<field_key>`.
    pub fn row_array(&self, array_key: &str, field_key: &str) -> bool {
        self.arrays
            .get(array_key)
            .is_some_and(|group| group.row_arrays.contains(field_key))
    }

    /// What the schema declares about one element of the array source —
    /// `None` when the key names no array source at all.
    pub fn array_element(&self, array_key: &str) -> Option<&ArrayElement> {
        self.arrays.get(array_key).map(|group| &group.element)
    }

    /// Whether any field (scalar or array source) with this key exists.
    pub fn contains(&self, key: &str) -> bool {
        self.scalars.contains_key(key) || self.arrays.contains_key(key)
    }

    /// The catalog path of the array a source key names from inside
    /// `scope`: a row-relative key resolves ONLY against its parent's
    /// path, and a document-scope key (the `scope: document` escape, or
    /// no enclosing scope at all) only against the top level. There is
    /// deliberately no fallback between them — a row-relative `items`
    /// must not silently resolve to a top-level array that happens to
    /// share the name, since layout reads it from the ROW. `None` back
    /// means no declared source, and the caller then stays silent rather
    /// than guessing.
    pub fn resolve_array_path(&self, scope: Option<&str>, key: &str) -> Option<String> {
        let path = match scope {
            Some(parent) => format!("{parent}.{key}"),
            None => key.to_string(),
        };
        self.arrays.contains_key(&path).then_some(path)
    }
}
