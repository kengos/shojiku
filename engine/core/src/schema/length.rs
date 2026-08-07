//! Schemas for the length- and track-shaped wire types.
//!
//! None of these forwards to the `*Repr` its `Deserialize` parses through,
//! and the reason is worth stating: every one of them deserializes the Repr
//! and THEN validates. `BasisRepr` is `number | string`, while `flexBasis`
//! accepts `0` and `"content"` and nothing else. A forwarded schema would be
//! too WIDE — which is the failure mode a key catalog exists to prevent,
//! because a too-wide catalog teaches an agent to emit input the engine
//! rejects. So each states what the parser accepts, and a test feeds every
//! declared form through the real `Deserialize`.

use super::sub;
use crate::{FlexBasis, GridTrack, Length, TrackSpec};
use schemars::{json_schema, JsonSchema, Schema, SchemaGenerator};
use std::borrow::Cow;

/// The seven unit suffixes `parse_length_text` recognises, as a regex
/// alternation. Only the SUFFIX is asserted: the numeric prefix goes through
/// `str::parse::<f64>`, whose grammar (exponents, signs) is wider than any
/// pattern worth writing here, and the finiteness check that follows is a
/// value bound rather than a shape.
const UNIT_SUFFIX: &str = r"(%|pt|rem|em|mm|cm|in)\s*$";

/// `10` (pt) or `"10mm"` / `"5%"` / `"2em"`. A bare string with no unit —
/// `"10"` — is refused, which is why the pattern is here rather than a plain
/// `"type": "string"`.
impl JsonSchema for Length {
    fn schema_name() -> Cow<'static, str> {
        "Length".into()
    }

    fn json_schema(_generator: &mut SchemaGenerator) -> Schema {
        json_schema!({
            "oneOf": [
                { "type": "number" },
                { "type": "string", "pattern": UNIT_SUFFIX },
            ],
        })
    }
}

/// `flexBasis` takes `content` or `0` — and nothing else. `w` is the key for
/// a fixed width, which is what the parser's own error message says.
impl JsonSchema for FlexBasis {
    fn schema_name() -> Cow<'static, str> {
        "FlexBasis".into()
    }

    fn json_schema(_generator: &mut SchemaGenerator) -> Schema {
        json_schema!({ "enum": ["content", 0] })
    }
}

/// A grid track: a number (pt), the keyword `auto`, an `fr` weight, or any
/// length string.
impl JsonSchema for GridTrack {
    fn schema_name() -> Cow<'static, str> {
        "GridTrack".into()
    }

    fn json_schema(_generator: &mut SchemaGenerator) -> Schema {
        json_schema!({
            "oneOf": [
                { "type": "number" },
                { "const": "auto" },
                { "type": "string", "pattern": r"fr\s*$" },
                { "type": "string", "pattern": UNIT_SUFFIX },
            ],
        })
    }
}

/// `columns` / `rows`: a whole-number track COUNT, or a sequence of track
/// sizes. The visitor accepts `visit_u64`/`visit_i64` but refuses
/// `visit_f64` ("track count must be a whole number") and refuses strings
/// outright, so `integer` — not `number` — is what the parser takes.
impl JsonSchema for TrackSpec {
    fn schema_name() -> Cow<'static, str> {
        "TrackSpec".into()
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        let track = sub::<GridTrack>(generator).to_value();
        json_schema!({
            "oneOf": [
                { "type": "integer", "minimum": 0 },
                { "type": "array", "items": track },
            ],
        })
    }
}
