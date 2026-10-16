//! `page.margin` wire type: the printable-area insets that become the
//! coordinate origin.
//!
//! Wire forms: the [`EdgeSpec`] forms — a bare number (all sides) or a
//! per-side `{ top/right/bottom/left }` mapping. The positional array
//! `[top, right, bottom, left]` was removed in 0.4.0 and is refused at
//! parse with the map to write instead. Side values accept every
//! [`Length`] unit; `%` resolves against the *page width* for all
//! four sides (the CSS edge rule). Negative sides and `auto` are
//! rejected at parse — a print margin cannot be negative, and items
//! escape into the margin with negative coordinates instead. The
//! authored form is preserved for round-trip serialization.

use crate::edges::EdgeSpec;
use crate::length::{snippet, Length};
use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// The page margins in one of the two wire forms, kept verbatim for
/// round-trip serialization. Resolution to pt is layout's job
/// ([`Self::edges`] hands over the authored lengths).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PageMargin(EdgeSpec);

impl PageMargin {
    /// Margin lengths in CSS order `[top, right, bottom, left]`.
    pub fn edges(&self) -> [Length; 4] {
        self.0.edges()
    }

    /// All four sides the same pt value (bare-number form); the
    /// engine-default constructor.
    pub(crate) fn uniform_pt(v: f64) -> Self {
        Self(EdgeSpec::uniform_pt(v))
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

/// Validates a parsed form: no negative sides, no `auto`.
fn guard<E: serde::de::Error>(spec: EdgeSpec) -> Result<PageMargin, E> {
    if spec.any_auto() {
        return Err(E::custom(
            "page margin must not be `auto` (auto is a flex-margin concept)",
        ));
    }
    if spec.any_negative() {
        return Err(E::custom(
            "page margin must not be negative (items reach into the margin with negative coordinates)",
        ));
    }
    Ok(PageMargin(spec))
}

/// The parse error for the removed positional array: it names the
/// removal and the map to write, and echoes none of the authored values.
const ARRAY_REMOVED: &str = "`page.margin` no longer takes the `[top, right, bottom, left]` \
     array (removed in 0.4.0); write the per-side map `{ top, right, bottom, left }` instead";

/// Hand-rolled like [`EdgeSpec`]'s: keeps the inner error messages
/// verbatim, and refuses the removed array with a migration hint rather
/// than serde's generic invalid-type error.
impl<'de> Deserialize<'de> for PageMargin {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct MarginVisitor;

        impl<'de> serde::de::Visitor<'de> for MarginVisitor {
            type Value = PageMargin;

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("a number (all sides) or a { top/right/bottom/left } mapping")
            }

            fn visit_u64<E: serde::de::Error>(self, v: u64) -> Result<PageMargin, E> {
                self.visit_f64(v as f64)
            }

            fn visit_i64<E: serde::de::Error>(self, v: i64) -> Result<PageMargin, E> {
                self.visit_f64(v as f64)
            }

            fn visit_f64<E: serde::de::Error>(self, v: f64) -> Result<PageMargin, E> {
                guard(crate::edges::all_sides(v).map_err(E::custom)?)
            }

            // Explicit so the error echoes a bounded snippet, not the
            // whole attacker-controlled string (serde's default
            // invalid-type error echoes it verbatim).
            fn visit_str<E: serde::de::Error>(self, s: &str) -> Result<PageMargin, E> {
                Err(E::custom(format!(
                    "page margin takes a number (all sides) or a \
                     {{ top/right/bottom/left }} mapping, got string `{}`",
                    snippet(s)
                )))
            }

            fn visit_map<A: serde::de::MapAccess<'de>>(
                self,
                map: A,
            ) -> Result<PageMargin, A::Error> {
                guard(EdgeSpec::deserialize(
                    serde::de::value::MapAccessDeserializer::new(map),
                )?)
            }

            fn visit_seq<A: serde::de::SeqAccess<'de>>(
                self,
                _seq: A,
            ) -> Result<PageMargin, A::Error> {
                Err(serde::de::Error::custom(ARRAY_REMOVED))
            }
        }

        deserializer.deserialize_any(MarginVisitor)
    }
}

impl Serialize for PageMargin {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.serialize(serializer)
    }
}

#[cfg(test)]
mod tests;
