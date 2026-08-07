//! Schemas for the two wire types that parse through `serde_json::Value`.
//!
//! Both accept a set of JSON shapes rather than a Rust shape, so the derive
//! would describe a newtype/enum that never appears on the wire.

use super::sub;
use crate::definitions::LabeledEnumValue;
use crate::{EnumEntry, EqualsValue};
use schemars::{json_schema, JsonSchema, Schema, SchemaGenerator};
use std::borrow::Cow;

/// A form mark's `equals` predicate: a scalar the params value is compared
/// against by strict equality. Maps and sequences are parse errors — the
/// comparison is type-strict, so `"2"` never equals `2`.
impl JsonSchema for EqualsValue {
    fn schema_name() -> Cow<'static, str> {
        "EqualsValue".into()
    }

    fn json_schema(_generator: &mut SchemaGenerator) -> Schema {
        json_schema!({ "type": ["string", "number", "boolean"] })
    }
}

/// A `definitions` enum member: either the labeled object form
/// `{ value, label }`, or a bare scalar. The parser branches on
/// `Value::is_object()`, so an object goes to the labeled form and
/// everything else is taken verbatim as the bare value.
impl JsonSchema for EnumEntry {
    fn schema_name() -> Cow<'static, str> {
        "EnumEntry".into()
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        let labeled = sub::<LabeledEnumValue>(generator).to_value();
        json_schema!({
            "oneOf": [
                labeled,
                { "type": ["string", "number", "boolean", "null", "array"] },
            ],
        })
    }
}
