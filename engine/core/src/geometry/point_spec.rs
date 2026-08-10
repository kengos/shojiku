//! A `line` endpoint: authored coordinates, or an anchor to another item.
//!
//! Two authored forms share one key (`from:` / `to:`), so the wire needs a
//! discriminated read. It is written by hand rather than derived as
//! `#[serde(untagged)]`: serde's untagged path reports "data did not match
//! any variant" and never names the offending key, which would silently
//! regress the pinned guarantee that `{ x: 0, y: 0, z: 1 }` is refused BY
//! NAME. The same trade the `visible:` wire refused when it rejected
//! `#[serde(flatten)]`; the hand-written precedent is `EqualsValue`.
//!
//! The helper struct below is the whole read: an all-optional
//! `deny_unknown_fields` shape that keeps serde's own "unknown field
//! `z`, expected one of …" error, followed by the arm choice, which adds
//! two errors serde could not phrase (`{ x: 0, item: a }` and `{}`).

use serde::ser::SerializeStruct;
use serde::{de, Deserialize, Deserializer, Serialize, Serializer};

use crate::length::Length;

/// Which point of the target's box an anchored endpoint lands on. The
/// names are the `<anchor-side>` subset CSS Anchor Positioning Level 1
/// defines; `center` is the unmarked value (see [`AnchorPoint::edge`]).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "lowercase")]
pub enum AnchorEdge {
    Top,
    Right,
    Bottom,
    Left,
    Center,
}

/// A shift applied to a resolved anchor point, in points. Both axes
/// default to 0, so `offset: { y: -4 }` is a lift with no horizontal
/// component.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct AnchorOffset {
    #[serde(default, skip_serializing_if = "is_zero")]
    pub x: f64,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub y: f64,
}

fn is_zero(v: &f64) -> bool {
    *v == 0.0
}

/// An endpoint expressed as "this point of that item's placement".
#[derive(Debug, Clone, PartialEq)]
pub struct AnchorPoint {
    /// The target item's authored `id:`. Ids are not unique-checked, and
    /// one item yields one placement per page and per `repeat` element —
    /// resolution picks the first placement on the endpoint's own page and
    /// warns when there is more than one.
    pub item: String,
    /// `None` is `center`, kept unresolved so an authored `edge: center`
    /// round-trips as written. CSS makes `<anchor-side>` mandatory because
    /// `anchor()` answers a one-axis inset; a line endpoint is a POINT, so
    /// there is no axis to make the side mandatory for and the target's
    /// centre is the natural unmarked value.
    pub edge: Option<AnchorEdge>,
    pub offset: Option<AnchorOffset>,
}

impl AnchorPoint {
    /// The authored edge, or the `center` default.
    pub fn edge(&self) -> AnchorEdge {
        self.edge.unwrap_or(AnchorEdge::Center)
    }

    /// The authored offset, or a zero shift.
    pub fn offset(&self) -> AnchorOffset {
        self.offset.unwrap_or_default()
    }
}

/// A `line` endpoint. Coordinates are full [`Length`]s, so an endpoint can
/// name a fraction of the box it sits in (`"100%"`) instead of a
/// hand-measured pt — which is what lets a line underline a flex child
/// whose real width is unknowable at authoring time. Bare numbers stay
/// `pt`, so every pre-existing template parses and re-serializes
/// unchanged. `x` resolves against the placement context's width, `y`
/// against its height (a `%` under an auto-height parent drops with
/// `percent_of_auto`, like every other vertical `%`).
#[derive(Debug, Clone, PartialEq)]
pub enum PointSpec {
    /// `{ x, y }` — resolved against the placement context.
    Xy { x: Length, y: Length },
    /// `{ item, edge?, offset? }` — resolved against another item's
    /// finished placement, after the page is laid out.
    Anchor(AnchorPoint),
}

impl PointSpec {
    /// The authored coordinates, when this endpoint carries them.
    pub fn xy(&self) -> Option<(Length, Length)> {
        match self {
            PointSpec::Xy { x, y } => Some((*x, *y)),
            PointSpec::Anchor(_) => None,
        }
    }

    /// The anchor, when this endpoint is anchored.
    pub fn anchor(&self) -> Option<&AnchorPoint> {
        match self {
            PointSpec::Xy { .. } => None,
            PointSpec::Anchor(a) => Some(a),
        }
    }
}

/// The permissive read: every key optional, unknown keys still refused by
/// serde itself so the "unknown field `z`" error keeps naming the key.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PointFields {
    #[serde(default)]
    x: Option<Length>,
    #[serde(default)]
    y: Option<Length>,
    #[serde(default)]
    item: Option<String>,
    #[serde(default)]
    edge: Option<AnchorEdge>,
    #[serde(default)]
    offset: Option<AnchorOffset>,
}

impl<'de> Deserialize<'de> for PointSpec {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let f = PointFields::deserialize(deserializer)?;
        let anchored = f.item.is_some() || f.edge.is_some() || f.offset.is_some();
        match (f.x, f.y, f.item, anchored) {
            (Some(_), _, _, true) | (_, Some(_), _, true) => Err(de::Error::custom(
                "an endpoint is either `x`/`y` or `item`, not both",
            )),
            (Some(x), Some(y), _, false) => Ok(PointSpec::Xy { x, y }),
            (Some(_), None, _, false) => Err(de::Error::missing_field("y")),
            (None, Some(_), _, false) => Err(de::Error::missing_field("x")),
            (None, None, Some(item), _) => Ok(PointSpec::Anchor(AnchorPoint {
                item,
                edge: f.edge,
                offset: f.offset,
            })),
            (None, None, None, true) => Err(de::Error::missing_field("item")),
            (None, None, None, false) => Err(de::Error::custom(
                "an endpoint needs either `x` and `y` or `item`",
            )),
        }
    }
}

impl Serialize for PointSpec {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            PointSpec::Xy { x, y } => {
                let mut s = serializer.serialize_struct("PointSpec", 2)?;
                s.serialize_field("x", x)?;
                s.serialize_field("y", y)?;
                s.end()
            }
            PointSpec::Anchor(a) => {
                let n = 1 + usize::from(a.edge.is_some()) + usize::from(a.offset.is_some());
                let mut s = serializer.serialize_struct("PointSpec", n)?;
                s.serialize_field("item", &a.item)?;
                match &a.edge {
                    Some(edge) => s.serialize_field("edge", edge)?,
                    None => s.skip_field("edge")?,
                }
                match &a.offset {
                    Some(offset) => s.serialize_field("offset", offset)?,
                    None => s.skip_field("offset")?,
                }
                s.end()
            }
        }
    }
}

#[cfg(test)]
mod tests;
