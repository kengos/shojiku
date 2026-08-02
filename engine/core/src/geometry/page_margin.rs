//! `page.margin` wire type: the printable-area insets that become the
//! coordinate origin (PM1).
//!
//! Wire forms: the [`EdgeSpec`] forms — a bare number (all sides) or a
//! per-side `{ top/right/bottom/left }` mapping — plus the legacy
//! positional array `[top, right, bottom, left]` kept for compatibility
//! and coordinate-faithful imports (Thinreports). Side values accept
//! every [`Length`] unit; `%` resolves against the *page width* for all
//! four sides (the CSS edge rule). Negative sides and `auto` are
//! rejected at parse — a print margin cannot be negative, and items
//! escape into the margin with negative coordinates instead. The
//! authored form is preserved for round-trip serialization.

use crate::edges::EdgeSpec;
use crate::length::{snippet, Length};
use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// The page margins in one of the three wire forms. Resolution to pt is
/// layout's job ([`Self::edges`] hands over the authored lengths).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PageMargin(Repr);

/// The authored wire form, kept verbatim for round-trip serialization.
#[derive(Debug, Clone, Copy, PartialEq)]
enum Repr {
    /// Bare number or per-side mapping (the item-edge forms).
    Edges(EdgeSpec),
    /// Legacy positional `[top, right, bottom, left]` array.
    Array([Length; 4]),
}

impl PageMargin {
    /// Margin lengths in CSS order `[top, right, bottom, left]`.
    pub fn edges(&self) -> [Length; 4] {
        match &self.0 {
            Repr::Edges(spec) => spec.edges(),
            Repr::Array(sides) => *sides,
        }
    }

    /// All four sides the same pt value (bare-number form); the
    /// engine-default constructor.
    pub(crate) fn uniform_pt(v: f64) -> Self {
        Self(Repr::Edges(EdgeSpec::uniform_pt(v)))
    }
}

/// The engine default: 25pt on every side (kept from the informational
/// era; `margin: 0` is the one-line escape hatch for sheet-absolute
/// coordinates).
impl PageMargin {
    /// Whether this is the authored-unset default (skip serialization).
    pub fn is_default(&self) -> bool {
        *self == PageMargin::default()
    }
}

impl Default for PageMargin {
    fn default() -> Self {
        Self::uniform_pt(25.0)
    }
}

/// True when the length is negative (rejected for page margins). Every
/// variant carries its sign in the value — the em/rem bases are positive.
fn negative(len: &Length) -> bool {
    match len {
        Length::Pt(v)
        | Length::Percent(v)
        | Length::Physical(v, _)
        | Length::Em(v)
        | Length::Rem(v) => *v < 0.0,
    }
}

/// Validates a parsed form: no negative sides, no `auto`.
fn guard<E: serde::de::Error>(margin: PageMargin) -> Result<PageMargin, E> {
    let rejected = match &margin.0 {
        Repr::Edges(spec) if spec.any_auto() => {
            Some("page margin must not be `auto` (auto is a flex-margin concept)")
        }
        Repr::Edges(spec) if spec.any_negative() => Some(NEGATIVE_MSG),
        Repr::Array(sides) if sides.iter().any(negative) => Some(NEGATIVE_MSG),
        _ => None,
    };
    match rejected {
        Some(msg) => Err(E::custom(msg)),
        None => Ok(margin),
    }
}

const NEGATIVE_MSG: &str =
    "page margin must not be negative (items reach into the margin with negative coordinates)";

/// Hand-rolled like [`EdgeSpec`]'s: keeps the inner error messages
/// verbatim and adds the array arm.
impl<'de> Deserialize<'de> for PageMargin {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct MarginVisitor;

        impl<'de> serde::de::Visitor<'de> for MarginVisitor {
            type Value = PageMargin;

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str(
                    "a number (all sides), a { top/right/bottom/left } mapping, \
                     or a [top, right, bottom, left] array",
                )
            }

            fn visit_u64<E: serde::de::Error>(self, v: u64) -> Result<PageMargin, E> {
                self.visit_f64(v as f64)
            }

            fn visit_i64<E: serde::de::Error>(self, v: i64) -> Result<PageMargin, E> {
                self.visit_f64(v as f64)
            }

            fn visit_f64<E: serde::de::Error>(self, v: f64) -> Result<PageMargin, E> {
                let spec = crate::edges::all_sides(v).map_err(E::custom)?;
                guard(PageMargin(Repr::Edges(spec)))
            }

            // Explicit so the error echoes a bounded snippet, not the
            // whole attacker-controlled string (serde's default
            // invalid-type error echoes it verbatim).
            fn visit_str<E: serde::de::Error>(self, s: &str) -> Result<PageMargin, E> {
                Err(E::custom(format!(
                    "page margin takes a number (all sides), a \
                     {{ top/right/bottom/left }} mapping, or a \
                     [top, right, bottom, left] array, got string `{}`",
                    snippet(s)
                )))
            }

            fn visit_map<A: serde::de::MapAccess<'de>>(
                self,
                map: A,
            ) -> Result<PageMargin, A::Error> {
                let spec =
                    EdgeSpec::deserialize(serde::de::value::MapAccessDeserializer::new(map))?;
                guard(PageMargin(Repr::Edges(spec)))
            }

            fn visit_seq<A: serde::de::SeqAccess<'de>>(
                self,
                seq: A,
            ) -> Result<PageMargin, A::Error> {
                let sides =
                    <[Length; 4]>::deserialize(serde::de::value::SeqAccessDeserializer::new(seq))?;
                guard(PageMargin(Repr::Array(sides)))
            }
        }

        deserializer.deserialize_any(MarginVisitor)
    }
}

impl Serialize for PageMargin {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match &self.0 {
            Repr::Edges(spec) => spec.serialize(serializer),
            Repr::Array(sides) => sides.serialize(serializer),
        }
    }
}

#[cfg(test)]
mod tests;
