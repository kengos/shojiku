//! `textDecoration`'s wire spelling: `none`, `underline`, `line_through`, or
//! both lines as one whitespace-separated string (`underline line_through`,
//! either order — CSS `text-decoration-line`). Hand-written because a derived
//! enum takes exactly one keyword; the serialization is canonical
//! (`underline line_through`), and the schema lives in `schema/border.rs`.

use super::TextDecoration;
use serde::de::{self, Visitor};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;

impl TextDecoration {
    /// The canonical wire spelling.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Underline => "underline",
            Self::LineThrough => "line_through",
            Self::UnderlineLineThrough => "underline line_through",
        }
    }

    /// Whether an underline is drawn.
    pub fn underline(self) -> bool {
        matches!(self, Self::Underline | Self::UnderlineLineThrough)
    }

    /// Whether a line-through is drawn.
    pub fn line_through(self) -> bool {
        matches!(self, Self::LineThrough | Self::UnderlineLineThrough)
    }

    /// Parses one wire value. Tokens are whitespace-separated, each at most
    /// once; `none` stands alone.
    fn parse(value: &str) -> Option<Self> {
        let tokens: Vec<&str> = value.split_whitespace().collect();
        if tokens == ["none"] {
            return Some(Self::None);
        }
        let mut underline = false;
        let mut line_through = false;
        for token in tokens {
            match token {
                "underline" if !underline => underline = true,
                "line_through" if !line_through => line_through = true,
                _ => return None,
            }
        }
        match (underline, line_through) {
            (true, true) => Some(Self::UnderlineLineThrough),
            (true, false) => Some(Self::Underline),
            (false, true) => Some(Self::LineThrough),
            (false, false) => None,
        }
    }
}

impl Serialize for TextDecoration {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_str())
    }
}

struct DecorationVisitor;

impl Visitor<'_> for DecorationVisitor {
    type Value = TextDecoration;

    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("`none`, `underline`, `line_through`, or `underline line_through`")
    }

    fn visit_str<E: de::Error>(self, value: &str) -> Result<Self::Value, E> {
        TextDecoration::parse(value)
            .ok_or_else(|| E::invalid_value(de::Unexpected::Str(value), &self))
    }
}

impl<'de> Deserialize<'de> for TextDecoration {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_str(DecorationVisitor)
    }
}
