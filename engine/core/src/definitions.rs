//! `definitions` — the data dictionary for the Designer, AI, and validation.
//!
//! Definitions are *not* required at render time; they enrich validation
//! (do bound keys exist? do the params match the declared shapes?) and let
//! the formatter know a field's type without guessing from the JSON value.
//!
//! The wire is an OpenAPI-style schema isomorphic to the params JSON:
//! `type: object` + `properties` at the root, `type: array` + `items` for
//! table/repeat/list sources, JSON-Schema constraint keys
//! (`required`/`minLength`/`minimum`/`enum`/…), `format` as the OPEN
//! data-semantic vocabulary, and `displayFormat`/`displayFormats` for the
//! presentation variants. The retired v1 `groups` form is detected and
//! rejected with a migration hint.

use crate::error::CoreError;
use serde::{Deserialize, Serialize};
use shojiku_diagnostics::Echo;
use std::collections::BTreeMap;

mod schema;
mod shape;
#[cfg(test)]
mod tests;

pub use schema::{
    EnumEntry, FieldType, FormatVariant, LabeledEnumValue, Schema, SchemaType, MAX_ENUM_VALUES,
    MAX_SCHEMA_DEPTH, MAX_SCHEMA_NODES,
};

/// Top-level definitions document: the root object schema. Unknown keys
/// are parse errors (like the template wire): a mistyped top-level key is
/// loud, not a silently dropped dictionary that would flood every binding
/// with `unknown_data_key`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Definitions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// Must be `object` — checked after parse so the error names the key.
    #[serde(rename = "type")]
    pub schema_type: SchemaType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Required top-level keys (present and non-`null` in params).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub required: Vec<String>,
    /// The top-level properties: scalar fields, object groups, and array
    /// (table/repeat/list) sources — binding keys are the dotted paths.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub properties: BTreeMap<String, Schema>,
}

/// Parses definitions from YAML (or JSON, which is a YAML subset).
/// Rejects non-finite numbers, locates structural errors to their field
/// path (see [`crate::parse`]), enforces the schema caps, and answers the
/// retired v1 `groups` form with a migration hint.
pub fn parse_definitions(input: &str) -> Result<Definitions, CoreError> {
    let defs: Definitions = match crate::parse::parse_checked(input, "definitions") {
        Ok(defs) => defs,
        Err(e) => return Err(v1_form_hint(input).unwrap_or(e)),
    };
    shape::check_shape(&defs)?;
    Ok(defs)
}

/// Detects the retired v1 form (a top-level `groups:` list) so its parse
/// error carries a migration pointer instead of a bare unknown-field.
fn v1_form_hint(input: &str) -> Option<CoreError> {
    let raw: serde_yaml::Value = serde_yaml::from_str(input).ok()?;
    let key = serde_yaml::Value::String("groups".to_string());
    raw.as_mapping()?
        .contains_key(&key)
        .then(|| CoreError::Located {
            what: "definitions",
            path: Echo::from("groups"),
            line: 0,
            column: 0,
            message: "the `groups` list is the retired v1 form; definitions now use the \
                  OpenAPI-schema shape (`type: object` + `properties`) — see \
                  docs/engine/definitions.md"
                .into(),
        })
}
