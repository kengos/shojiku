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
use schemars::{JsonSchema, Schema, SchemaGenerator, json_schema};
use std::borrow::Cow;

// Every class in these patterns is spelled out — `[0-9]` rather than `\d`,
// an explicit whitespace class rather than `\s`, and `-` escaped inside a
// class — so a pattern means the same thing in every regex dialect a catalog
// reader might run: `\d` matches non-ASCII digits in Python and .NET, `\s`
// matches U+FEFF in JavaScript, and an unescaped `-` in a class is a syntax
// error under JavaScript's `v` flag. A test holds the spelling.

/// The unsigned decimal number `str::parse::<f64>` reads, written so no
/// input has two ways to match: digits with an optional fraction, or a bare
/// fraction, then an optional exponent. The parser also takes `inf` and
/// `nan`, which its finiteness check then refuses, so the pattern leaves
/// them out; an exponent large enough to overflow is a value bound, not a
/// shape, and still matches.
const UNSIGNED: &str = r"([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+\-]?[0-9]+)?";

/// The whitespace the patterns allow where the parser trims: ASCII only,
/// spelled out. `str::trim` drops every Unicode `White_Space` character, but
/// a JavaScript `\s` also matches U+FEFF, which `trim` keeps — so `\s`
/// would admit `"\u{FEFF}10mm"`, a string the engine refuses. The explicit
/// class is narrower than the parser instead (a no-break space is trimmed
/// but not offered), the direction that never teaches a rejected input.
const WS: &str = r"[\t\n\v\f\r ]*";

/// A whole length string. The parser trims the input and then the number,
/// so whitespace is allowed at both ends and before the unit. Anchored at
/// both ends: a pattern is a search, so without `^` it accepts any string
/// that merely ENDS in a unit (`"abc10mm"`).
fn length_pattern() -> String {
    format!(r"^{WS}[+\-]?{UNSIGNED}{WS}(%|pt|rem|em|mm|cm|in){WS}$")
}

/// An `fr` weight. The parser refuses a negative weight, so the only sign
/// offered is `+`.
fn fr_pattern() -> String {
    format!(r"^{WS}\+?{UNSIGNED}{WS}fr{WS}$")
}

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
                { "type": "string", "pattern": length_pattern() },
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
                { "type": "string", "pattern": fr_pattern() },
                { "type": "string", "pattern": length_pattern() },
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
