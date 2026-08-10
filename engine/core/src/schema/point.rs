//! The schema for a `line` endpoint.
//!
//! Stated as the two real arms rather than forwarded from the permissive
//! helper the parser reads through — the helper accepts `{}` and
//! `{ x: 0, item: a }`, both of which the arm choice then refuses, and a
//! catalog wider than the parser teaches an agent to emit input the engine
//! rejects (see the note atop [`super::length`]).

use super::sub;
use crate::geometry::{AnchorEdge, AnchorOffset, PointSpec};
use crate::Length;
use schemars::{json_schema, JsonSchema, Schema, SchemaGenerator};
use std::borrow::Cow;

/// `{ x, y }` (both required) or `{ item, edge?, offset? }` — never a mix.
impl JsonSchema for PointSpec {
    fn schema_name() -> Cow<'static, str> {
        "PointSpec".into()
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        let length = sub::<Length>(generator).to_value();
        let edge = sub::<AnchorEdge>(generator).to_value();
        let offset = sub::<AnchorOffset>(generator).to_value();
        json_schema!({
            "oneOf": [
                {
                    "type": "object",
                    "properties": { "x": length.clone(), "y": length },
                    "required": ["x", "y"],
                    "additionalProperties": false,
                },
                {
                    "type": "object",
                    "properties": { "item": { "type": "string" }, "edge": edge, "offset": offset },
                    "required": ["item"],
                    "additionalProperties": false,
                },
            ],
        })
    }
}
