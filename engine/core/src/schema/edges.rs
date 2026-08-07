//! Schemas for the edge/page geometry wire types.
//!
//! `EdgeSpec` and `PageMargin` share the "number for all sides, or a
//! per-side map" shape and both refuse strings outright — the visitors say
//! so in their own error messages, so the schema must not offer a string
//! arm. `PageMargin` adds the legacy positional array.

use super::sub;
use crate::edges::EdgeMapRepr;
use crate::{EdgeSpec, EdgeValue, Length, PageMargin, PageSize};
use schemars::{json_schema, JsonSchema, Schema, SchemaGenerator};
use std::borrow::Cow;

/// A side value: a length, or the keyword `auto` (meaningful on margins
/// only — `padding` rejects it at parse, which is a validation rather than
/// a shape and so is not expressible here).
impl JsonSchema for EdgeValue {
    fn schema_name() -> Cow<'static, str> {
        "EdgeValue".into()
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        let length = sub::<Length>(generator).to_value();
        json_schema!({
            "oneOf": [
                length,
                { "const": "auto" },
            ],
        })
    }
}

/// `margin` / `padding`: a bare number (all sides) or a
/// `{ top/right/bottom/left }` mapping. The map arm forwards to
/// [`EdgeMapRepr`], which is what the visitor's `visit_map` parses through.
impl JsonSchema for EdgeSpec {
    fn schema_name() -> Cow<'static, str> {
        "EdgeSpec".into()
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        let map = sub::<EdgeMapRepr>(generator).to_value();
        json_schema!({
            "oneOf": [
                { "type": "number" },
                map,
            ],
        })
    }
}

/// `page.margin`: the two [`EdgeSpec`] forms plus the legacy positional
/// `[top, right, bottom, left]` array. Negative sides and `auto` are
/// rejected at parse — a value constraint the shape cannot carry.
impl JsonSchema for PageMargin {
    fn schema_name() -> Cow<'static, str> {
        "PageMargin".into()
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        let map = sub::<EdgeMapRepr>(generator).to_value();
        let length = sub::<Length>(generator).to_value();
        json_schema!({
            "oneOf": [
                { "type": "number" },
                map,
                {
                    "type": "array",
                    "items": length,
                    "minItems": 4,
                    "maxItems": 4,
                },
            ],
        })
    }
}

/// `page.size`: one of eight named sizes, or `{ w, h }`.
///
/// NOT forwarded to `PageSizeRepr`: that says "any string", while the
/// parser's `TryFrom` accepts exactly the eight names below. The custom arm
/// carries value bounds the shape cannot — each side must be ABSOLUTE (pt or
/// mm/cm/in, so no `%`/`em`), positive, and at most `MAX_PAGE_PT` — and
/// those stay with the parser.
impl JsonSchema for PageSize {
    fn schema_name() -> Cow<'static, str> {
        "PageSize".into()
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        let length = sub::<Length>(generator).to_value();
        json_schema!({
            "oneOf": [
                { "enum": ["A3", "A4", "A5", "B4", "B5", "Letter", "Legal", "Tabloid"] },
                {
                    "type": "object",
                    "properties": { "w": length.clone(), "h": length },
                    "required": ["w", "h"],
                    "additionalProperties": false,
                },
            ],
        })
    }
}
