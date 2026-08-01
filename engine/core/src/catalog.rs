//! A flattened, queryable view of `definitions` for validation/formatting.
//!
//! The flatten walk is the v1↔v2 compatibility keystone: the schema tree
//! reduces to the same dotted-key lookup tables the validator and the
//! formatter always consumed, so nothing downstream knows the wire shape
//! changed. Nested objects flatten to dotted scalar keys
//! (`receipt.number`); an array property registers under its dotted path
//! with its row fields keyed relative to one element.

use crate::definitions::{Definitions, FieldType, Schema, SchemaType};
use std::collections::{HashMap, HashSet};

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
}

/// Lookup tables built from [`Definitions`].
#[derive(Debug, Clone, Default)]
pub struct Catalog {
    /// Scalar fields keyed by full dotted path (`order.code`).
    scalars: HashMap<String, FieldSpec>,
    /// Array sources: dotted array path -> (row-relative key -> spec).
    arrays: HashMap<String, HashMap<String, FieldSpec>>,
    /// Row-relative ARRAY keys per array source (a list inside a repeat
    /// cell): declared shape, no scalar spec — binding checks accept the
    /// key, layout checks the value.
    row_arrays: HashMap<String, HashSet<String>>,
}

impl Catalog {
    pub fn from_definitions(defs: &Definitions) -> Self {
        let mut catalog = Catalog::default();
        for (name, schema) in &defs.properties {
            flatten(name.clone(), schema, &mut catalog);
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
        self.arrays.get(array_key)?.get(field_key)
    }

    /// Whether `field_key` is a declared row-relative ARRAY of the source
    /// (a list bound inside its cell/card).
    pub fn row_array(&self, array_key: &str, field_key: &str) -> bool {
        self.row_arrays
            .get(array_key)
            .is_some_and(|keys| keys.contains(field_key))
    }

    /// Whether any field (scalar or array source) with this key exists.
    pub fn contains(&self, key: &str) -> bool {
        self.scalars.contains_key(key) || self.arrays.contains_key(key)
    }
}

/// Registers one top-level-or-nested property under its dotted prefix.
fn flatten(prefix: String, schema: &Schema, catalog: &mut Catalog) {
    match schema.schema_type {
        SchemaType::Object => {
            for (name, child) in &schema.properties {
                flatten(format!("{prefix}.{name}"), child, catalog);
            }
        }
        SchemaType::Array => {
            let mut fields = HashMap::new();
            let mut row_arrays = HashSet::new();
            if let Some(items) = &schema.items {
                if items.schema_type == SchemaType::Object {
                    collect_row(None, items, &mut fields, &mut row_arrays);
                }
            }
            catalog.arrays.insert(prefix.clone(), fields);
            catalog.row_arrays.insert(prefix, row_arrays);
        }
        _ => {
            catalog.scalars.insert(prefix, spec_from(schema));
        }
    }
}

/// Collects one array row's leaf fields, keys relative to the element
/// (nested row objects flatten to dotted relative keys). A row's own ARRAY
/// child (a list inside a repeat cell) registers its KEY only — binding
/// checks accept it, layout checks the value shape.
fn collect_row(
    prefix: Option<&str>,
    row: &Schema,
    fields: &mut HashMap<String, FieldSpec>,
    row_arrays: &mut HashSet<String>,
) {
    for (name, child) in &row.properties {
        let key = match prefix {
            Some(prefix) => format!("{prefix}.{name}"),
            None => name.clone(),
        };
        match child.schema_type {
            SchemaType::Object => collect_row(Some(&key), child, fields, row_arrays),
            SchemaType::Array => {
                row_arrays.insert(key);
            }
            _ => {
                fields.insert(key, spec_from(child));
            }
        }
    }
}

/// The declared value→label pairs, for a plain-text field only. A bare
/// member contributes nothing (it renders its value); every other field
/// type drops the labels here and warns at validate.
fn enum_labels_of(schema: &Schema) -> Vec<(serde_json::Value, String)> {
    if schema.field_type() != FieldType::String {
        return Vec::new();
    }
    let mut out = Vec::new();
    for entry in schema.enum_values.as_deref().unwrap_or_default() {
        if let Some(label) = entry.label() {
            out.push((entry.value().clone(), label.to_string()));
        }
    }
    out
}

fn spec_from(schema: &Schema) -> FieldSpec {
    FieldSpec {
        field_type: schema.field_type(),
        currency: schema.currency.clone(),
        precision: schema.precision,
        unit: schema.unit.clone(),
        format: schema.display_format.clone(),
        formats: schema
            .display_formats
            .iter()
            .map(|f| f.id.clone())
            .collect(),
        placeholder: schema.placeholder.clone(),
        enum_labels: enum_labels_of(schema),
    }
}
