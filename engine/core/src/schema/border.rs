//! Schemas for the per-side border properties and `textCombineUpright`.
//!
//! All three border properties share one hand-rolled map visitor
//! (`style/border.rs`'s `visit_sides`): every side optional, unknown side
//! keys rejected by name. [`super::per_side_map`] is that shape.

use super::{per_side_map, sub};
use crate::{BorderColor, BorderStyle, BorderStyleKind, BorderWidth, TextCombineUpright};
use schemars::{json_schema, JsonSchema, Schema, SchemaGenerator};
use std::borrow::Cow;

/// `borderWidth`: a non-negative pt number, or a per-side map of them.
impl JsonSchema for BorderWidth {
    fn schema_name() -> Cow<'static, str> {
        "BorderWidth".into()
    }

    fn json_schema(_generator: &mut SchemaGenerator) -> Schema {
        let side = json_schema!({ "type": "number", "minimum": 0 });
        let map = per_side_map(&side).to_value();
        json_schema!({ "oneOf": [side, map] })
    }
}

/// `borderColor`: a `#rrggbb` string, or a per-side map of them. The
/// visitor takes any string; colour syntax is validated later, so the
/// schema does not claim a pattern it does not enforce.
impl JsonSchema for BorderColor {
    fn schema_name() -> Cow<'static, str> {
        "BorderColor".into()
    }

    fn json_schema(_generator: &mut SchemaGenerator) -> Schema {
        let side = json_schema!({ "type": "string" });
        let map = per_side_map(&side).to_value();
        json_schema!({ "oneOf": [side, map] })
    }
}

/// `borderStyle`: one [`BorderStyleKind`] keyword, or a per-side map of
/// them. Both arms reach the same closed keyword set.
impl JsonSchema for BorderStyle {
    fn schema_name() -> Cow<'static, str> {
        "BorderStyle".into()
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        let kind = sub::<BorderStyleKind>(generator);
        let map = per_side_map(&kind).to_value();
        json_schema!({ "oneOf": [kind.to_value(), map] })
    }
}

/// `textCombineUpright`: the keywords `none` / `all`, or a
/// `{ digits: 2..=4 }` map. The bound is the parser's — `digits_form`
/// refuses anything outside it — so the schema states the range rather than
/// deferring to the map form's bare `u8` field.
impl JsonSchema for TextCombineUpright {
    fn schema_name() -> Cow<'static, str> {
        "TextCombineUpright".into()
    }

    fn json_schema(_generator: &mut SchemaGenerator) -> Schema {
        json_schema!({
            "oneOf": [
                { "enum": ["none", "all"] },
                {
                    "type": "object",
                    "properties": {
                        "digits": { "type": "integer", "minimum": 2, "maximum": 4 },
                    },
                    "required": ["digits"],
                    "additionalProperties": false,
                },
            ],
        })
    }
}
