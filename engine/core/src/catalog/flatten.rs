//! The schema → lookup-table walk: one `Schema` node becomes a scalar
//! entry, an object to descend, or an [`ArrayGroup`] under its dotted
//! path. Bounded by the parse-time `MAX_SCHEMA_DEPTH` (see the module
//! header on [`super`]), so it carries no depth argument of its own.

use super::{ArrayElement, ArrayGroup, Catalog, FieldSpec};
use crate::definitions::{FieldType, Schema, SchemaType};
use std::collections::{HashMap, HashSet};

/// Registers one top-level-or-nested property under its dotted prefix.
pub(super) fn flatten(prefix: String, schema: &Schema, catalog: &mut Catalog) {
    match schema.schema_type {
        SchemaType::Object => {
            for (name, child) in &schema.properties {
                flatten(format!("{prefix}.{name}"), child, catalog);
            }
        }
        SchemaType::Array => flatten_array(prefix, schema, catalog),
        _ => {
            catalog.scalars.insert(prefix, spec_from(schema));
        }
    }
}

/// Registers an array source, then each array its rows carry — a nested
/// source is a source in its own right, keyed by the joined path, so
/// binding checks and the formatter reach its element fields exactly as
/// they reach a top-level array's.
fn flatten_array(prefix: String, schema: &Schema, catalog: &mut Catalog) {
    let mut nested: Vec<(String, &Schema)> = Vec::new();
    let mut group = ArrayGroup {
        fields: HashMap::new(),
        row_arrays: HashSet::new(),
        element: ArrayElement::Undeclared,
    };
    if let Some(items) = &schema.items {
        match items.schema_type {
            SchemaType::Object => {
                group.element = ArrayElement::Object;
                collect_row(None, items, &mut group, &mut nested);
            }
            // An array of arrays has neither fields nor a scalar spec:
            // the element stays UNDECLARED so no check reads it.
            SchemaType::Array => {}
            _ => group.element = ArrayElement::Scalar(Box::new(spec_from(items))),
        }
    }
    catalog.arrays.insert(prefix.clone(), group);
    for (key, child) in nested {
        flatten_array(format!("{prefix}.{key}"), child, catalog);
    }
}

/// Collects one array row's leaf fields, keys relative to the element
/// (nested row objects flatten to dotted relative keys). A row's own ARRAY
/// child registers its key here AND is handed back for registration as a
/// group under the joined path.
fn collect_row<'a>(
    prefix: Option<&str>,
    row: &'a Schema,
    group: &mut ArrayGroup,
    nested: &mut Vec<(String, &'a Schema)>,
) {
    for (name, child) in &row.properties {
        let key = match prefix {
            Some(prefix) => format!("{prefix}.{name}"),
            None => name.clone(),
        };
        match child.schema_type {
            SchemaType::Object => collect_row(Some(&key), child, group, nested),
            SchemaType::Array => {
                group.row_arrays.insert(key.clone());
                nested.push((key, child));
            }
            _ => {
                group.fields.insert(key, spec_from(child));
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
        enum_values: schema
            .enum_values
            .as_deref()
            .unwrap_or_default()
            .iter()
            .map(|entry| entry.value().clone())
            .collect(),
    }
}
