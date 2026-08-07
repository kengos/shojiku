//! Box-edge insets: per-side `margin` / `padding` values on item boxes.
//!
//! Wire forms: a bare YAML number applies to all four sides; a mapping
//! names each side explicitly (`{ top: 10, left: "5%" }`) with unset
//! sides = 0. Side values accept every [`Length`] unit (bare pt, `pt`,
//! `%`, `mm`/`cm`/`in`); `%` resolves against the parent *width* for
//! every side, the CSS margin/padding rule. Margin sides additionally
//! accept the `auto` keyword (`{ left: auto }`) — flex placement
//! distributes free space into auto margins, elsewhere they resolve
//! to 0; `padding` rejects `auto` like it rejects negatives. Only the
//! authored keys are serialized back, so the source form round-trips.
//! Named sides were chosen over a CSS positional shorthand string so the
//! GUI/AI edit one key per side with no second grammar to parse (North
//! star: named, discoverable constructs beat positional ones).

use crate::length::{parse_length_text, snippet, Length};
use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// One authored edge value: a [`Length`] or the `auto` keyword. `auto`
/// is only meaningful on margins (free-space absorption in flex);
/// `padding` rejects it at parse.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EdgeValue {
    /// Absorb a share of the parent's free space (flex); 0 elsewhere.
    Auto,
    /// A regular length.
    Len(Length),
}

impl<'de> Deserialize<'de> for EdgeValue {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct ValueVisitor;

        impl serde::de::Visitor<'_> for ValueVisitor {
            type Value = EdgeValue;

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("a length (number or %/pt/mm/cm/in string) or `auto`")
            }

            fn visit_u64<E: serde::de::Error>(self, v: u64) -> Result<EdgeValue, E> {
                self.visit_f64(v as f64)
            }

            fn visit_i64<E: serde::de::Error>(self, v: i64) -> Result<EdgeValue, E> {
                self.visit_f64(v as f64)
            }

            fn visit_f64<E: serde::de::Error>(self, v: f64) -> Result<EdgeValue, E> {
                crate::length::finite(Length::Pt(v), v)
                    .map(EdgeValue::Len)
                    .map_err(E::custom)
            }

            fn visit_str<E: serde::de::Error>(self, s: &str) -> Result<EdgeValue, E> {
                if s.trim() == "auto" {
                    Ok(EdgeValue::Auto)
                } else {
                    parse_length_text(s)
                        .map(EdgeValue::Len)
                        .map_err(|err| E::custom(format!("{err} (margins also accept `auto`)")))
                }
            }
        }

        deserializer.deserialize_any(ValueVisitor)
    }
}

impl Serialize for EdgeValue {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            EdgeValue::Auto => serializer.serialize_str("auto"),
            EdgeValue::Len(len) => len.serialize(serializer),
        }
    }
}

/// Four box edges (`margin` or `padding`): the authored per-side values
/// (`None` = unset = 0) plus the wire form for round-trip serialization.
/// Box sizing is border-box only: `padding` insets content within the
/// box, `margin` spaces the box in its parent.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EdgeSpec {
    /// Authored sides in CSS order `[top, right, bottom, left]`.
    sides: [Option<EdgeValue>; 4],
    form: EdgeForm,
}

/// The authored wire form: a bare number or a per-side mapping.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EdgeForm {
    Number,
    Map,
}

impl EdgeSpec {
    /// Edge lengths in CSS order `[top, right, bottom, left]`; unset and
    /// `auto` sides are zero (auto's free-space share is layout's job —
    /// see [`Self::auto_sides`]).
    pub fn edges(&self) -> [Length; 4] {
        self.sides.map(|side| match side {
            Some(EdgeValue::Len(len)) => len,
            Some(EdgeValue::Auto) | None => Length::Pt(0.0),
        })
    }

    /// Which sides are authored `auto`, in CSS order `[top, right,
    /// bottom, left]`.
    pub fn auto_sides(&self) -> [bool; 4] {
        self.sides.map(|side| side == Some(EdgeValue::Auto))
    }

    /// All four sides the same pt value (the bare-number wire form).
    /// Infallible: callers pass compile-time constants, not wire input.
    pub(crate) fn uniform_pt(v: f64) -> Self {
        Self {
            sides: [Some(EdgeValue::Len(Length::Pt(v))); 4],
            form: EdgeForm::Number,
        }
    }

    /// True when any authored side is negative. Padding rejects these at
    /// parse: negative padding is CSS-invalid and would *widen* the
    /// child basis (margins may legitimately be negative). `page.margin`
    /// rejects them too (a print margin cannot be negative).
    pub(crate) fn any_negative(&self) -> bool {
        self.sides.iter().flatten().any(|value| match value {
            EdgeValue::Auto => false,
            // Every variant carries its sign in the value (the em/rem
            // bases are positive), so the sign check is uniform.
            EdgeValue::Len(
                Length::Pt(v)
                | Length::Percent(v)
                | Length::Physical(v, _)
                | Length::Em(v)
                | Length::Rem(v),
            ) => *v < 0.0,
        })
    }

    /// True when any side is `auto` (padding and `page.margin` reject
    /// those at parse).
    pub(crate) fn any_auto(&self) -> bool {
        self.auto_sides().into_iter().any(|auto| auto)
    }
}

/// The mapping wire form. Unknown keys are rejected — a typo like
/// `letf:` silently meaning 0 would be an invisible authoring bug.
#[derive(Deserialize, Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub(crate) struct EdgeMapRepr {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    top: Option<EdgeValue>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    right: Option<EdgeValue>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    bottom: Option<EdgeValue>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    left: Option<EdgeValue>,
}

/// Builds the all-sides form from a bare number, rejecting non-finite
/// values (YAML `1e309` parses to `inf` before `yaml_guard` can see it
/// here). Shared with the `page.margin` deserializer.
pub(crate) fn all_sides(v: f64) -> Result<EdgeSpec, String> {
    let len = crate::length::finite(Length::Pt(v), v)?;
    Ok(EdgeSpec {
        sides: [Some(EdgeValue::Len(len)); 4],
        form: EdgeForm::Number,
    })
}

/// Hand-rolled (not `#[serde(untagged)]`): untagged enums replace every
/// inner error with "did not match any variant", which would hide the
/// unknown-key and invalid-length messages authors need. A visitor keeps
/// them verbatim and gives strings a pointed rejection.
impl<'de> Deserialize<'de> for EdgeSpec {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct EdgeVisitor;

        impl<'de> serde::de::Visitor<'de> for EdgeVisitor {
            type Value = EdgeSpec;

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("a number (all sides) or a { top/right/bottom/left } mapping")
            }

            fn visit_u64<E: serde::de::Error>(self, v: u64) -> Result<EdgeSpec, E> {
                self.visit_f64(v as f64)
            }

            fn visit_i64<E: serde::de::Error>(self, v: i64) -> Result<EdgeSpec, E> {
                self.visit_f64(v as f64)
            }

            fn visit_f64<E: serde::de::Error>(self, v: f64) -> Result<EdgeSpec, E> {
                all_sides(v).map_err(E::custom)
            }

            fn visit_str<E: serde::de::Error>(self, s: &str) -> Result<EdgeSpec, E> {
                Err(E::custom(format!(
                    "margin/padding take a number (all sides) or a \
                     {{ top/right/bottom/left }} mapping (`margin: {{ left: auto }}` \
                     for auto margins), got string `{}`",
                    snippet(s)
                )))
            }

            fn visit_map<A: serde::de::MapAccess<'de>>(self, map: A) -> Result<EdgeSpec, A::Error> {
                let repr =
                    EdgeMapRepr::deserialize(serde::de::value::MapAccessDeserializer::new(map))?;
                Ok(EdgeSpec {
                    sides: [repr.top, repr.right, repr.bottom, repr.left],
                    form: EdgeForm::Map,
                })
            }
        }

        deserializer.deserialize_any(EdgeVisitor)
    }
}

impl Serialize for EdgeSpec {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match (self.form, self.sides[0]) {
            // A number form always holds four equal Pt sides; degrade to
            // the map rather than panic if hand-built otherwise.
            (EdgeForm::Number, Some(EdgeValue::Len(Length::Pt(v)))) => serializer.serialize_f64(v),
            _ => EdgeMapRepr {
                top: self.sides[0],
                right: self.sides[1],
                bottom: self.sides[2],
                left: self.sides[3],
            }
            .serialize(serializer),
        }
    }
}

/// `deserialize_with` helper for `padding` fields: negative padding and
/// `auto` are rejected at parse (see [`EdgeSpec::any_negative`] /
/// [`EdgeSpec::any_auto`] — free-space absorption is a margin concept).
pub(crate) fn deserialize_padding<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<EdgeSpec>, D::Error> {
    let spec = Option::<EdgeSpec>::deserialize(deserializer)?;
    match spec {
        Some(s) if s.any_negative() => Err(serde::de::Error::custom(
            "padding must not be negative (use margin for negative offsets)",
        )),
        Some(s) if s.any_auto() => Err(serde::de::Error::custom(
            "padding must not be `auto` (auto is a margin concept)",
        )),
        other => Ok(other),
    }
}

#[cfg(test)]
mod tests;
