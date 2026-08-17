//! Positioning core — page geometry and box model.
//!
//! The non-inherited half of the template model: page size/orientation and
//! the rectangles items occupy. Coordinates are PDF points (1pt = 1/72
//! inch), origin at the top-left of the page, y growing downward
//! (Thinreports-style). Positioning never cascades — a container passes
//! *style* to its children, never geometry (see [`crate::style`]).

use crate::length::Length;
use serde::{Deserialize, Serialize};

mod box_model;
mod flex;
pub(crate) mod grid;
mod page_margin;
mod point_spec;

pub use box_model::{BoxSpec, OptBox};
pub use flex::{AlignItems, BoxType, FlexBasis, FlexDirection, JustifyContent};
pub use grid::{GridTrack, TrackSpec, MAX_GRID_TRACKS};
pub use page_margin::PageMargin;
pub use point_spec::{AnchorEdge, AnchorOffset, AnchorPoint, PointSpec};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PageSpec {
    #[serde(default, skip_serializing_if = "PageSize::is_default")]
    pub size: PageSize,
    #[serde(default, skip_serializing_if = "Orientation::is_default")]
    pub orientation: Orientation,
    /// Printable-area insets: the margin box is the coordinate
    /// origin for bands and the body — `x: 0` / `y: 0` mean the margin
    /// corner, and absolute items reach into the margin with negative
    /// coordinates. Defaults to 25pt on every side.
    #[serde(default, skip_serializing_if = "PageMargin::is_default")]
    pub margin: PageMargin,
}

impl PageSpec {
    /// Whether every field is authored-unset (skip serialization).
    pub fn is_default(&self) -> bool {
        *self == PageSpec::default()
    }
}

impl PageSpec {
    /// Final page dimensions in pt, taking orientation into account.
    ///
    /// `orientation` swaps the two dimensions of a NAMED size only. A
    /// custom `{ w, h }` already states its dimensions literally, so
    /// `orientation` is a no-op there — otherwise an author who writes a
    /// landscape custom size AND `orientation: landscape` would double-swap
    /// back to portrait with no diagnostic. Express a custom size's
    /// orientation in its dimensions; layout warns `orientation_ignored`
    /// on the combination (see [`PageSpec::orientation_ignored`]).
    pub fn dimensions_pt(&self) -> (f64, f64) {
        let (w, h) = self.size.dimensions_pt();
        if self.orientation == Orientation::Landscape
            && !matches!(self.size, PageSize::Custom { .. })
        {
            (h, w)
        } else {
            (w, h)
        }
    }

    /// Whether an explicit `orientation: landscape` is being ignored
    /// because the size is a literal custom `{ w, h }`. Layout surfaces
    /// this as the `orientation_ignored` warning.
    pub fn orientation_ignored(&self) -> bool {
        self.orientation == Orientation::Landscape && matches!(self.size, PageSize::Custom { .. })
    }
}

/// Maximum custom page dimension in pt: the PDF specification's page
/// size limit (14,400pt = 200in). Also the sanity cap for untrusted
/// templates driving page geometry.
pub const MAX_PAGE_PT: f64 = 14_400.0;

/// Page size: a named size or custom dimensions as absolute lengths
/// (`{ w, h }`, portrait; bare pt or a physical unit — e.g. an 80mm
/// thermal receipt is `w: 80mm`). `%` has no page to resolve against and
/// is rejected at parse. Named sizes: ISO A (`A3`–`A5`), JIS B (`B4`
/// 257×364mm / `B5` 182×257mm — the Japanese B series, not ISO B), and
/// North-American `Letter` / `Legal` / `Tabloid`. Every size defaults to
/// the same 25pt page margin ([`PageMargin`]).
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub enum PageSize {
    A3,
    #[default]
    A4,
    A5,
    B4,
    B5,
    Letter,
    Legal,
    Tabloid,
    Custom {
        w: Length,
        h: Length,
    },
}

impl PageSize {
    /// Whether this is the authored-unset default (skip serialization).
    pub fn is_default(&self) -> bool {
        *self == PageSize::default()
    }

    /// Page size in pt as (width, height) for portrait orientation.
    pub fn dimensions_pt(&self) -> (f64, f64) {
        match self {
            PageSize::A3 => (841.89, 1190.55),
            PageSize::A4 => (595.28, 841.89),
            PageSize::A5 => (419.53, 595.28),
            PageSize::B4 => (728.5, 1031.81),
            PageSize::B5 => (515.91, 728.5),
            PageSize::Letter => (612.0, 792.0),
            PageSize::Legal => (612.0, 1008.0),
            PageSize::Tabloid => (792.0, 1224.0),
            // Parse rejects `%` here; a hand-constructed Percent (Rust
            // code, not a template) degrades to 0 rather than panicking.
            PageSize::Custom { w, h } => (
                w.absolute_pt().unwrap_or(0.0),
                h.absolute_pt().unwrap_or(0.0),
            ),
        }
    }
}

/// Wire form: a name string or a `{ w, h }` mapping.
#[derive(Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(untagged)]
enum PageSizeRepr {
    Name(String),
    Custom { w: Length, h: Length },
}

impl TryFrom<PageSizeRepr> for PageSize {
    type Error = String;

    fn try_from(repr: PageSizeRepr) -> Result<Self, Self::Error> {
        match repr {
            PageSizeRepr::Name(name) => match name.as_str() {
                "A3" => Ok(PageSize::A3),
                "A4" => Ok(PageSize::A4),
                "A5" => Ok(PageSize::A5),
                "B4" => Ok(PageSize::B4),
                "B5" => Ok(PageSize::B5),
                "Letter" => Ok(PageSize::Letter),
                "Legal" => Ok(PageSize::Legal),
                "Tabloid" => Ok(PageSize::Tabloid),
                other => Err(format!(
                    "unknown page size `{}`: expected A3/A4/A5, B4/B5 (JIS), \
                     Letter/Legal/Tabloid, or {{ w, h }} (pt or mm/cm/in)",
                    crate::length::snippet(other)
                )),
            },
            PageSizeRepr::Custom { w, h } => {
                // Belt and braces alongside yaml_guard: page dimensions
                // feed every layout basis, so bound them at the model.
                // `Length` parse already guarantees finite values.
                let valid = |l: Length| {
                    l.absolute_pt()
                        .is_some_and(|pt| pt > 0.0 && pt <= MAX_PAGE_PT)
                };
                if valid(w) && valid(h) {
                    Ok(PageSize::Custom { w, h })
                } else {
                    Err(format!(
                        "custom page size must be absolute (pt or mm/cm/in), \
                         positive, and at most {MAX_PAGE_PT}pt per side"
                    ))
                }
            }
        }
    }
}

impl<'de> Deserialize<'de> for PageSize {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let repr = PageSizeRepr::deserialize(deserializer)?;
        PageSize::try_from(repr).map_err(serde::de::Error::custom)
    }
}

impl Serialize for PageSize {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        match self {
            PageSize::A3 => serializer.serialize_str("A3"),
            PageSize::A4 => serializer.serialize_str("A4"),
            PageSize::A5 => serializer.serialize_str("A5"),
            PageSize::B4 => serializer.serialize_str("B4"),
            PageSize::B5 => serializer.serialize_str("B5"),
            PageSize::Letter => serializer.serialize_str("Letter"),
            PageSize::Legal => serializer.serialize_str("Legal"),
            PageSize::Tabloid => serializer.serialize_str("Tabloid"),
            PageSize::Custom { w, h } => {
                let mut s = serializer.serialize_struct("PageSize", 2)?;
                s.serialize_field("w", w)?;
                s.serialize_field("h", h)?;
                s.end()
            }
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum Orientation {
    #[default]
    Portrait,
    Landscape,
}

impl Orientation {
    /// Whether this is the authored-unset default (skip serialization).
    pub fn is_default(&self) -> bool {
        *self == Orientation::default()
    }
}
