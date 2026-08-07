//! Per-side border wire: the scalar-or-map forms of `borderWidth`
//! / `borderColor` and the new `borderStyle` (solid | double).
//!
//! Each key keeps its original scalar form (all four sides) and gains a
//! `{ top, right, bottom, left }` map (unset side = width 0 / color
//! black / style solid). Hand-written visitors — not `untagged` — so a
//! wrong shape names the accepted forms instead of serde's "did not
//! match any variant" (the guess-hostility lesson). The authored
//! form round-trips.

use serde::de::{Error as DeError, MapAccess, Visitor};
use serde::ser::SerializeMap;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;

/// CSS `border-style` keyword subset. `double` draws two parallel lines
/// (each a third of the width, separated by a third); `dashed` and
/// `dotted` stroke one line with a repeating on/off pattern derived from
/// the side's width (see the layout side's `dash_pattern`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum BorderStyleKind {
    #[default]
    Solid,
    Double,
    Dashed,
    Dotted,
}

impl BorderStyleKind {
    /// Parses the wire keyword. `None` is the caller's cue to report the
    /// accepted set — the hand-written visitors below and the `line`
    /// item's own style share this one table.
    pub(crate) fn from_wire(v: &str) -> Option<Self> {
        match v {
            "solid" => Some(BorderStyleKind::Solid),
            "double" => Some(BorderStyleKind::Double),
            "dashed" => Some(BorderStyleKind::Dashed),
            "dotted" => Some(BorderStyleKind::Dotted),
            _ => None,
        }
    }

    /// The accepted keywords, for the "expected …" half of a parse error.
    pub(crate) const WIRE_NAMES: &'static str = "solid, double, dashed or dotted";
}

/// One value per side; `None` = the key's unset-side default.
pub type Sides<T> = [Option<T>; 4];

/// `borderWidth`: bare pt number (all sides) or a per-side map
/// (unset side = 0). Negative widths are parse errors.
#[derive(Debug, Clone, PartialEq)]
pub enum BorderWidth {
    All(f64),
    /// `[top, right, bottom, left]`.
    PerSide(Sides<f64>),
}

/// `borderColor`: one `#rrggbb` (all sides) or a per-side map
/// (unset side draws black).
#[derive(Debug, Clone, PartialEq)]
pub enum BorderColor {
    All(String),
    PerSide(Sides<String>),
}

/// `borderStyle`: one keyword (all sides) or a per-side map
/// (unset side = solid).
#[derive(Debug, Clone, PartialEq)]
pub enum BorderStyle {
    All(BorderStyleKind),
    PerSide(Sides<BorderStyleKind>),
}

impl BorderWidth {
    /// The uniform width when the scalar form was authored.
    pub fn uniform(&self) -> Option<f64> {
        match self {
            BorderWidth::All(w) => Some(*w),
            BorderWidth::PerSide(_) => None,
        }
    }

    /// `[top, right, bottom, left]`, unset sides 0.
    pub fn sides(&self) -> [f64; 4] {
        match self {
            BorderWidth::All(w) => [*w; 4],
            BorderWidth::PerSide(sides) => sides.map(|s| s.unwrap_or(0.0)),
        }
    }
}

impl BorderColor {
    /// `[top, right, bottom, left]`; `None` sides draw black.
    pub fn sides(&self) -> Sides<String> {
        match self {
            BorderColor::All(c) => [
                Some(c.clone()),
                Some(c.clone()),
                Some(c.clone()),
                Some(c.clone()),
            ],
            BorderColor::PerSide(sides) => sides.clone(),
        }
    }
}

impl BorderStyle {
    /// `[top, right, bottom, left]`, unset sides solid.
    pub fn sides(&self) -> [BorderStyleKind; 4] {
        match self {
            BorderStyle::All(k) => [*k; 4],
            BorderStyle::PerSide(sides) => sides.map(|s| s.unwrap_or_default()),
        }
    }
}

/// Reads the `{ top, right, bottom, left }` body shared by all three
/// keys; unknown keys are errors.
fn visit_sides<'de, T: Deserialize<'de>, A: MapAccess<'de>>(
    mut map: A,
) -> Result<Sides<T>, A::Error> {
    let mut sides: Sides<T> = [None, None, None, None];
    while let Some(key) = map.next_key::<String>()? {
        let slot = match key.as_str() {
            "top" => 0,
            "right" => 1,
            "bottom" => 2,
            "left" => 3,
            other => {
                return Err(A::Error::custom(format!(
                    "unknown border side `{other}` (expected top/right/bottom/left)"
                )));
            }
        };
        sides[slot] = Some(map.next_value()?);
    }
    Ok(sides)
}

fn serialize_sides<T: Serialize, S: Serializer>(
    sides: &Sides<T>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    let mut map = serializer.serialize_map(None)?;
    for (name, value) in ["top", "right", "bottom", "left"].iter().zip(sides) {
        if let Some(v) = value {
            map.serialize_entry(name, v)?;
        }
    }
    map.end()
}

impl<'de> Deserialize<'de> for BorderWidth {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct V;
        impl<'de> Visitor<'de> for V {
            type Value = BorderWidth;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("a border width in pt or a { top/right/bottom/left } map")
            }
            fn visit_f64<E: DeError>(self, v: f64) -> Result<BorderWidth, E> {
                if v < 0.0 {
                    return Err(E::custom("border width must not be negative"));
                }
                Ok(BorderWidth::All(v))
            }
            fn visit_u64<E: DeError>(self, v: u64) -> Result<BorderWidth, E> {
                self.visit_f64(v as f64)
            }
            fn visit_i64<E: DeError>(self, v: i64) -> Result<BorderWidth, E> {
                self.visit_f64(v as f64)
            }
            fn visit_map<A: MapAccess<'de>>(self, map: A) -> Result<BorderWidth, A::Error> {
                let sides = visit_sides::<f64, A>(map)?;
                if sides.iter().flatten().any(|w| *w < 0.0) {
                    return Err(A::Error::custom("border width must not be negative"));
                }
                Ok(BorderWidth::PerSide(sides))
            }
        }
        deserializer.deserialize_any(V)
    }
}

impl Serialize for BorderWidth {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            BorderWidth::All(w) => serializer.serialize_f64(*w),
            BorderWidth::PerSide(sides) => serialize_sides(sides, serializer),
        }
    }
}

impl<'de> Deserialize<'de> for BorderColor {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct V;
        impl<'de> Visitor<'de> for V {
            type Value = BorderColor;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("a #rrggbb color or a { top/right/bottom/left } map")
            }
            fn visit_str<E: DeError>(self, v: &str) -> Result<BorderColor, E> {
                Ok(BorderColor::All(v.to_string()))
            }
            fn visit_map<A: MapAccess<'de>>(self, map: A) -> Result<BorderColor, A::Error> {
                Ok(BorderColor::PerSide(visit_sides::<String, A>(map)?))
            }
        }
        deserializer.deserialize_any(V)
    }
}

impl Serialize for BorderColor {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            BorderColor::All(c) => serializer.serialize_str(c),
            BorderColor::PerSide(sides) => serialize_sides(sides, serializer),
        }
    }
}

impl<'de> Deserialize<'de> for BorderStyle {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct V;
        impl<'de> Visitor<'de> for V {
            type Value = BorderStyle;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("solid | double | dashed | dotted, or a { top/right/bottom/left } map")
            }
            fn visit_str<E: DeError>(self, v: &str) -> Result<BorderStyle, E> {
                BorderStyleKind::from_wire(v)
                    .map(BorderStyle::All)
                    .ok_or_else(|| {
                        E::custom(format!(
                            "unknown border style `{v}` (expected {})",
                            BorderStyleKind::WIRE_NAMES
                        ))
                    })
            }
            fn visit_map<A: MapAccess<'de>>(self, map: A) -> Result<BorderStyle, A::Error> {
                visit_sides::<BorderStyleKind, A>(map).map(BorderStyle::PerSide)
            }
        }
        deserializer.deserialize_any(V)
    }
}

impl Serialize for BorderStyle {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            BorderStyle::All(k) => k.serialize(serializer),
            BorderStyle::PerSide(sides) => serialize_sides(sides, serializer),
        }
    }
}

#[cfg(test)]
mod tests;
