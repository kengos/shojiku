//! Definitions-schema checks: params-vs-schema validation (required keys,
//! value types, ranges, enum membership, unknown keys) and the
//! format/base-type coherence warning. All warnings — rendering proceeds
//! (blanks are the placeholder feature's domain). Params diagnostics carry
//! their location in the `key` arg, never in `path` (whose grammar is
//! template box paths).

use crate::definitions::{Definitions, FieldType, Schema, SchemaType};
use serde_json::Value;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};

#[cfg(test)]
mod tests;

/// Warns once per leaf whose KNOWN semantic `format` sits on a base type
/// it does not apply to (`format: currency` on a string, …). Unknown
/// format values are generation hints and stay silent.
pub(super) fn check_definitions_quality(defs: &Definitions, diags: &mut Diagnostics) {
    for (name, schema) in &defs.properties {
        quality_walk(name, schema, diags);
    }
}

fn quality_walk(key: &str, schema: &Schema, diags: &mut Diagnostics) {
    let (field_type, ignored) = schema.mapped();
    if ignored {
        let format = schema.format.as_deref().unwrap_or_default();
        diags.push(
            Diagnostic::new(Code::DefinitionsFormatIgnored)
                .arg("key", key)
                .arg("format", format)
                .arg("type", schema.schema_type.as_str()),
        );
    }
    // Labels are display words for a plain text value; every other field
    // type renders through its own formatter (a date pattern, a currency
    // variant), which has no place to put them. Warn rather than drop
    // silently — an authored label that never appears is a standing lie.
    let labeled = schema
        .enum_values
        .as_deref()
        .unwrap_or_default()
        .iter()
        .any(|entry| entry.label().is_some());
    if labeled && field_type != FieldType::String {
        diags.push(
            Diagnostic::new(Code::DefinitionsEnumLabelsIgnored)
                .arg("key", key)
                .arg("type", field_type.as_str()),
        );
    }
    for (name, child) in &schema.properties {
        quality_walk(&format!("{key}.{name}"), child, diags);
    }
    if let Some(items) = &schema.items {
        quality_walk(key, items, diags);
    }
}

/// Validates the params tree against the declared schema. Descends only
/// where the schema declares a matching object property, so a hostile
/// params document cannot drive unbounded recursion: an unknown key is
/// reported at its top and never entered.
pub(super) fn check_params_schema(defs: &Definitions, params: &Value, diags: &mut Diagnostics) {
    let Some(object) = params.as_object() else {
        return;
    };
    check_object(None, &defs.required, &defs.properties, object, diags);
}

fn join(prefix: Option<&str>, key: &str) -> String {
    match prefix {
        Some(prefix) => format!("{prefix}.{key}"),
        None => key.to_string(),
    }
}

fn check_object(
    prefix: Option<&str>,
    required: &[String],
    properties: &std::collections::BTreeMap<String, Schema>,
    object: &serde_json::Map<String, Value>,
    diags: &mut Diagnostics,
) {
    for key in required {
        let present = object.get(key).is_some_and(|v| !v.is_null());
        if !present {
            diags.push(Diagnostic::new(Code::ParamsMissingRequired).arg("key", join(prefix, key)));
        }
    }
    for (key, value) in object {
        let full = join(prefix, key);
        match properties.get(key) {
            Some(schema) => check_value(&full, schema, value, diags),
            None => diags.push(Diagnostic::new(Code::ParamsUnknownKey).arg("key", full)),
        }
    }
}

fn check_value(key: &str, schema: &Schema, value: &Value, diags: &mut Diagnostics) {
    // A blank (`null`/`""` — the shared predicate) is the placeholder /
    // `missing_data` domain, whatever the declared type: a blank-form
    // params variant fills number fields with `""` by convention, and that
    // must not read as a type mismatch. Empty arrays are NOT blank and
    // stay checked (`minItems`).
    if crate::params::is_blank(Some(value)) {
        return;
    }
    match schema.schema_type {
        SchemaType::Object => match value.as_object() {
            Some(object) => check_object(
                Some(key),
                &schema.required,
                &schema.properties,
                object,
                diags,
            ),
            None => mismatch(key, "object", value, diags),
        },
        SchemaType::Array => match value.as_array() {
            Some(items) => check_array(key, schema, items, diags),
            None => mismatch(key, "array", value, diags),
        },
        SchemaType::String => match value.as_str() {
            Some(s) => {
                check_length(key, "length", s.chars().count() as u64, schema, diags);
                check_enum(key, schema, value, diags);
            }
            None => mismatch(key, "string", value, diags),
        },
        SchemaType::Integer => {
            if value.as_i64().is_some() || value.as_u64().is_some() {
                check_range(key, value.as_f64(), schema, diags);
                check_enum(key, schema, value, diags);
            } else {
                mismatch(key, "integer", value, diags);
            }
        }
        SchemaType::Number => match value.as_f64() {
            Some(_) if value.is_number() => {
                check_range(key, value.as_f64(), schema, diags);
                check_enum(key, schema, value, diags);
            }
            _ => mismatch(key, "number", value, diags),
        },
        SchemaType::Boolean => {
            if value.is_boolean() {
                check_enum(key, schema, value, diags);
            } else {
                mismatch(key, "boolean", value, diags);
            }
        }
    }
}

fn check_array(key: &str, schema: &Schema, items: &[Value], diags: &mut Diagnostics) {
    check_length(key, "items", items.len() as u64, schema, diags);
    if let Some(element) = &schema.items {
        for (i, value) in items.iter().enumerate() {
            check_value(&format!("{key}[{i}]"), element, value, diags);
        }
    }
}

/// Shared length check: strings count chars, arrays count elements.
fn check_length(key: &str, kind: &str, count: u64, schema: &Schema, diags: &mut Diagnostics) {
    let (min, max) = match kind {
        "length" => (schema.min_length, schema.max_length),
        _ => (schema.min_items, schema.max_items),
    };
    let violation = match (min, max) {
        (Some(min), _) if count < min => Some(("below minimum", min)),
        (_, Some(max)) if count > max => Some(("above maximum", max)),
        _ => None,
    };
    if let Some((relation, limit)) = violation {
        diags.push(
            Diagnostic::new(Code::ParamsLengthOutOfRange)
                .arg("key", key)
                .arg("kind", kind)
                .arg("count", count)
                .arg("relation", relation)
                .arg("limit", limit),
        );
    }
}

fn check_range(key: &str, value: Option<f64>, schema: &Schema, diags: &mut Diagnostics) {
    let Some(value) = value else { return };
    let violation = match (schema.minimum, schema.maximum) {
        (Some(min), _) if value < min => Some(("below minimum", min)),
        (_, Some(max)) if value > max => Some(("above maximum", max)),
        _ => None,
    };
    if let Some((relation, limit)) = violation {
        diags.push(
            Diagnostic::new(Code::ParamsOutOfRange)
                .arg("key", key)
                .arg("value", value)
                .arg("relation", relation)
                .arg("limit", limit),
        );
    }
}

/// Declared-enum membership over scalar values, matched against each
/// entry's VALUE (an entry's display label is presentation and never
/// participates). The expected list is never echoed — only the key names
/// the field.
fn check_enum(key: &str, schema: &Schema, value: &Value, diags: &mut Diagnostics) {
    if let Some(values) = &schema.enum_values {
        if !values.iter().any(|entry| entry.value() == value) {
            diags.push(Diagnostic::new(Code::ParamsEnumMismatch).arg("key", key));
        }
    }
}

/// The JSON type word for a mismatch message; values are never echoed.
fn json_type(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

fn mismatch(key: &str, expected: &str, value: &Value, diags: &mut Diagnostics) {
    diags.push(
        Diagnostic::new(Code::ParamsTypeMismatch)
            .arg("key", key)
            .arg("expected", expected)
            .arg("actual", json_type(value)),
    );
}
