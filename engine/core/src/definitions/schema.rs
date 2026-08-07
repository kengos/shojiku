//! The OpenAPI-style schema node: types, constraints, the Shojiku
//! authoring keys, and the `(type, format)` → field-type mapping.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Deepest object/array nesting a definitions schema may declare.
pub const MAX_SCHEMA_DEPTH: usize = 16;
/// Total schema nodes (properties + items) a definitions file may declare.
pub const MAX_SCHEMA_NODES: usize = 4096;
/// Longest `enum` list a single schema node may declare.
pub const MAX_ENUM_VALUES: usize = 256;

/// One schema node: a params value's declared shape plus the authoring
/// metadata the Designer/AI read (title, example, display formats).
/// Unknown keys are parse errors; unset keys never serialize.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Schema {
    #[serde(rename = "type")]
    pub schema_type: SchemaType,
    /// The data-semantic hint (OpenAPI `format`): an OPEN vocabulary.
    /// Known values refine the field type (`date-time`, `date`, `image`
    /// on strings; `currency`, `percentage`, `quantity` on numbers);
    /// unknown values are generation hints (e.g. `person-name`) and
    /// leave the base type untouched.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Designer/AI sample value (OpenAPI `example`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub example: Option<serde_json::Value>,
    /// Declared value set (JSON Schema `enum`), capped at
    /// [`MAX_ENUM_VALUES`]. Each entry is a bare value or a
    /// [`LabeledEnumValue`] carrying that value's display label.
    #[serde(rename = "enum", default, skip_serializing_if = "Option::is_none")]
    pub enum_values: Option<Vec<EnumEntry>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_length: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_length: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub minimum: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub maximum: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_items: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_items: Option<u64>,
    /// Required child keys (objects only). A key is satisfied by any
    /// present, non-`null` value — an empty string is `minLength`'s job.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub required: Vec<String>,
    /// Child schemas (objects only). Iteration order is sorted; display
    /// order is the GUI's own (order-preserving) parse, not the engine's.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub properties: BTreeMap<String, Schema>,
    /// The element schema (arrays only).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub items: Option<Box<Schema>>,
    /// The field's own currency code override (`currency` format).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub precision: Option<u32>,
    /// Semantic unit key (`item`, …); display words live in the locale
    /// layer, never here.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    /// The field's blank-form default: drawn verbatim when a binding to
    /// it resolves to an absent/`null`/`""` value.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    /// The field's default DISPLAY variant (applied when the placement
    /// picks nothing) — distinct from the data-semantic `format`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_format: Option<String>,
    /// Declared display variants (the GUI format selector).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub display_formats: Vec<FormatVariant>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recommended_style: Option<serde_json::Value>,
}

/// One declared `enum` member: the bare value, or the value paired with
/// the words it displays as.
///
/// The two forms mix freely in one list — an unlabeled member renders its
/// value verbatim. Deserialization is hand-written rather than `untagged`
/// on purpose: an untagged fallback to [`serde_json::Value`] would swallow
/// a MAP whose keys are typos (`{ value: x, lable: y }`) as a plain object
/// member, and a silent accept is exactly what the wire's typo safety
/// exists to prevent. Any mapping is therefore read as the labeled form,
/// strictly. (Object enum members were never usable: membership is only
/// checked for scalar-typed fields.)
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
pub enum EnumEntry {
    /// A value with no declared label.
    Bare(serde_json::Value),
    /// A value and the label it displays as.
    Labeled(LabeledEnumValue),
}

impl EnumEntry {
    /// The declared value — what params are matched against.
    pub fn value(&self) -> &serde_json::Value {
        match self {
            EnumEntry::Bare(value) => value,
            EnumEntry::Labeled(labeled) => &labeled.value,
        }
    }

    /// The declared display label, if this entry carries one.
    pub fn label(&self) -> Option<&str> {
        match self {
            EnumEntry::Bare(_) => None,
            EnumEntry::Labeled(labeled) => Some(&labeled.label),
        }
    }
}

impl<'de> Deserialize<'de> for EnumEntry {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(deserializer)?;
        if value.is_object() {
            let labeled =
                serde_json::from_value(value).map_err(<D::Error as serde::de::Error>::custom)?;
            return Ok(EnumEntry::Labeled(labeled));
        }
        Ok(EnumEntry::Bare(value))
    }
}

/// The labeled `enum` member form: `{ value: shipped, label: 出荷済み }`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct LabeledEnumValue {
    /// The params value this entry declares (scalars only — see
    /// [`super::shape`]).
    pub value: serde_json::Value,
    /// The words the value displays as. An empty label renders empty.
    pub label: String,
}

/// A named display-format variant a field supports.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct FormatVariant {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// The JSON-Schema base types the engine understands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "lowercase")]
pub enum SchemaType {
    String,
    Number,
    Integer,
    Boolean,
    Object,
    Array,
}

impl SchemaType {
    /// The wire spelling, for diagnostics.
    pub fn as_str(self) -> &'static str {
        match self {
            SchemaType::String => "string",
            SchemaType::Number => "number",
            SchemaType::Integer => "integer",
            SchemaType::Boolean => "boolean",
            SchemaType::Object => "object",
            SchemaType::Array => "array",
        }
    }
}

/// The set of field types the engine understands (unchanged vocabulary —
/// `{key:type}` interpolation overrides keep using these names).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "lowercase")]
pub enum FieldType {
    String,
    Number,
    Currency,
    Datetime,
    Date,
    Quantity,
    Percentage,
    Boolean,
    Image,
}

impl FieldType {
    /// The type's name, as spelled in `{key:type}` overrides and reported
    /// by diagnostics that name a field's effective type.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::String => "string",
            Self::Number => "number",
            Self::Currency => "currency",
            Self::Datetime => "datetime",
            Self::Date => "date",
            Self::Quantity => "quantity",
            Self::Percentage => "percentage",
            Self::Boolean => "boolean",
            Self::Image => "image",
        }
    }

    /// Parses a type name as used in `{key:type}` interpolation overrides.
    pub fn from_name(name: &str) -> Option<Self> {
        match name {
            "string" => Some(Self::String),
            "number" => Some(Self::Number),
            "currency" => Some(Self::Currency),
            "datetime" => Some(Self::Datetime),
            "date" => Some(Self::Date),
            "quantity" => Some(Self::Quantity),
            "percentage" => Some(Self::Percentage),
            "boolean" => Some(Self::Boolean),
            "image" => Some(Self::Image),
            _ => None,
        }
    }
}

impl Schema {
    /// The field type this leaf maps to (see [`Schema::mapped`]).
    pub fn field_type(&self) -> FieldType {
        self.mapped().0
    }

    /// Maps `(type, format)` to the engine field type. The second value
    /// is true when a KNOWN semantic format sits on a base type it does
    /// not apply to (validation warns `definitions_format_ignored`);
    /// unknown formats are generation hints and never warn.
    pub fn mapped(&self) -> (FieldType, bool) {
        let base = match self.schema_type {
            SchemaType::Number | SchemaType::Integer => FieldType::Number,
            SchemaType::Boolean => FieldType::Boolean,
            _ => FieldType::String,
        };
        let Some(format) = self.format.as_deref() else {
            return (base, false);
        };
        let semantic = match (self.schema_type, format) {
            (SchemaType::String, "date-time") => Some(FieldType::Datetime),
            (SchemaType::String, "date") => Some(FieldType::Date),
            (SchemaType::String, "image") => Some(FieldType::Image),
            (SchemaType::Number | SchemaType::Integer, "currency") => Some(FieldType::Currency),
            (SchemaType::Number | SchemaType::Integer, "percentage") => Some(FieldType::Percentage),
            (SchemaType::Number | SchemaType::Integer, "quantity") => Some(FieldType::Quantity),
            _ => None,
        };
        if let Some(refined) = semantic {
            return (refined, false);
        }
        let known = matches!(
            format,
            "date-time" | "date" | "image" | "currency" | "percentage" | "quantity"
        );
        (base, known)
    }
}
