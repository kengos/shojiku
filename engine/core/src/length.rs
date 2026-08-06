//! Template length values: absolute points/physical units, a percentage
//! of the parent, or a font-relative `em`/`rem`.
//!
//! Bare YAML numbers stay `pt` (backwards compatible); strings add units:
//! `"50%"` resolves against the parent's size along the same axis, `"12pt"`
//! is an explicit point value, and the physical units `"80mm"` / `"1.5cm"` /
//! `"1in"` are absolute (1in = 72pt, 1cm = 10mm) so they need no layout
//! context. `"1.2em"` / `"1.5rem"` resolve against the font-relative bases
//! a [`FontRel`] carries: `em` = the inherited font size at the resolution
//! point, `rem` = the engine default font size. The authored unit is
//! preserved so serialization round-trips the source form (`"80mm"` stays
//! `80mm`, never `226.77…`). `px` is deliberately not a template unit (pt
//! is canonical; px exists only as the preview scale).

use serde::{Deserialize, Serialize, Serializer};

/// An absolute physical unit; converts to pt with no layout context.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PhysicalUnit {
    /// Millimetres (1mm = 72/25.4 pt).
    Mm,
    /// Centimetres (1cm = 10mm).
    Cm,
    /// Inches (1in = 72pt).
    In,
}

impl PhysicalUnit {
    /// Points per one unit of this kind.
    pub fn pt_per_unit(self) -> f64 {
        match self {
            PhysicalUnit::Mm => 72.0 / 25.4,
            PhysicalUnit::Cm => 720.0 / 25.4,
            PhysicalUnit::In => 72.0,
        }
    }

    /// The template suffix (`mm` / `cm` / `in`).
    pub fn suffix(self) -> &'static str {
        match self {
            PhysicalUnit::Mm => "mm",
            PhysicalUnit::Cm => "cm",
            PhysicalUnit::In => "in",
        }
    }
}

/// The engine default font size in pt: the root of the style cascade
/// (`ComputedStyle::default()` in layout) and the `rem` root. Deliberate —
/// `rem` is a constant scale unit today; a template-level root style may
/// replace this base later (pre-1.0 reversible).
pub const DEFAULT_FONT_SIZE_PT: f64 = 10.0;

/// The font-relative bases an `em`/`rem` length resolves against: `em` is
/// the inherited font size at the resolution point, `rem` the engine
/// default ([`DEFAULT_FONT_SIZE_PT`]). Carried alongside the geometric
/// basis so [`Length::resolve`] is total over every variant.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FontRel {
    /// The inherited font size in pt.
    pub em: f64,
    /// The rem root in pt (the engine default font size).
    pub rem: f64,
}

impl Default for FontRel {
    /// The document root: both bases are the engine default font size.
    fn default() -> Self {
        FontRel {
            em: DEFAULT_FONT_SIZE_PT,
            rem: DEFAULT_FONT_SIZE_PT,
        }
    }
}

/// A length in a template box: absolute (points or a physical unit), a
/// percentage of the parent's resolved size along the same axis (x/w →
/// width, y/h → height), or font-relative (`em`/`rem`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Length {
    /// Absolute points (1pt = 1/72 inch).
    Pt(f64),
    /// A physical unit kept in its authored form (value + unit) so the
    /// template round-trips; absolute like [`Length::Pt`].
    Physical(f64, PhysicalUnit),
    /// Percent of the parent's resolved size along the same axis.
    Percent(f64),
    /// Multiples of the inherited font size ([`FontRel::em`]).
    Em(f64),
    /// Multiples of the engine default font size ([`FontRel::rem`]).
    Rem(f64),
}

impl Length {
    /// Resolves to absolute points against the parent's size (`basis`)
    /// and the font-relative bases (`font`).
    pub fn resolve(&self, basis: f64, font: FontRel) -> f64 {
        match self {
            Length::Pt(v) => *v,
            Length::Physical(v, unit) => v * unit.pt_per_unit(),
            Length::Percent(p) => p / 100.0 * basis,
            Length::Em(v) => v * font.em,
            Length::Rem(v) => v * font.rem,
        }
    }

    /// The value in pt when the length needs no layout context (`pt` and
    /// physical units); `None` for `%`/`em`/`rem`, which need a basis.
    pub fn absolute_pt(&self) -> Option<f64> {
        match self {
            Length::Pt(v) => Some(*v),
            Length::Physical(v, unit) => Some(v * unit.pt_per_unit()),
            Length::Percent(_) | Length::Em(_) | Length::Rem(_) => None,
        }
    }
}

/// Wire form: a bare number (pt) or a suffixed string.
#[derive(Deserialize)]
#[serde(untagged)]
enum LengthRepr {
    Number(f64),
    Text(String),
}

impl TryFrom<LengthRepr> for Length {
    type Error = String;

    fn try_from(repr: LengthRepr) -> Result<Self, Self::Error> {
        match repr {
            LengthRepr::Number(v) => finite(Length::Pt(v), v),
            LengthRepr::Text(s) => parse_length_text(&s),
        }
    }
}

/// Parses the string wire form of a [`Length`] (`"50%"`, `"12pt"`,
/// `"80mm"`, …). Shared with edge values, whose margin sides also accept
/// the `auto` keyword before falling back to this.
pub(crate) fn parse_length_text(s: &str) -> Result<Length, String> {
    let s = s.trim();
    if let Some(pct) = s.strip_suffix('%') {
        let v = parse_number(pct)?;
        finite(Length::Percent(v), v)
    } else if let Some(pt) = s.strip_suffix("pt") {
        let v = parse_number(pt)?;
        finite(Length::Pt(v), v)
    } else if let Some(rem) = s.strip_suffix("rem") {
        // `rem` before `em`: every rem string also ends in "em".
        let v = parse_number(rem)?;
        finite(Length::Rem(v), v)
    } else if let Some(em) = s.strip_suffix("em") {
        let v = parse_number(em)?;
        finite(Length::Em(v), v)
    } else if let Some((num, unit)) = strip_physical(s) {
        let v = parse_number(num)?;
        let length = finite(Length::Physical(v, unit), v)?;
        // A finite authored value can still convert past
        // f64::MAX (`"1e308in"`): guard the pt form too so no
        // non-finite length ever reaches layout math.
        finite(length, v * unit.pt_per_unit())
    } else {
        Err(format!(
            "invalid length `{}`: expected a number (pt) or a \
             `%`/`pt`/`mm`/`cm`/`in`/`em`/`rem` suffixed string",
            snippet(s)
        ))
    }
}

/// Splits a physical-unit suffix off a trimmed length string.
fn strip_physical(s: &str) -> Option<(&str, PhysicalUnit)> {
    [PhysicalUnit::Mm, PhysicalUnit::Cm, PhysicalUnit::In]
        .into_iter()
        .find_map(|unit| s.strip_suffix(unit.suffix()).map(|num| (num, unit)))
}

fn parse_number(text: &str) -> Result<f64, String> {
    match text.trim().parse::<f64>() {
        Ok(v) => Ok(v),
        Err(_) => Err(format!("invalid length number `{}`", snippet(text))),
    }
}

/// Truncates template-supplied text before echoing it into an error:
/// the input is attacker-controlled and unbounded (yaml_guard caps
/// non-finite numbers, not string sizes). Shared with other template
/// string parsers (e.g. `PageSize`).
pub(crate) fn snippet(text: &str) -> String {
    shojiku_diagnostics::sanitize_marked(text, MAX_SNIPPET)
}

/// The cap for a length/size snippet. Tighter than the workspace default:
/// a well-formed length is a handful of characters.
const MAX_SNIPPET: usize = 32;

/// YAML numbers are already guarded by `yaml_guard`, but string forms
/// (`"1e309%"`) parse through `str::parse` and can produce infinities —
/// reject them here so no non-finite length ever reaches layout math.
pub(crate) fn finite(length: Length, value: f64) -> Result<Length, String> {
    if value.is_finite() {
        Ok(length)
    } else {
        Err(format!("length value {value} is not finite"))
    }
}

impl<'de> Deserialize<'de> for Length {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let repr = LengthRepr::deserialize(deserializer)?;
        Length::try_from(repr).map_err(serde::de::Error::custom)
    }
}

impl Serialize for Length {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Length::Pt(v) => serializer.serialize_f64(*v),
            Length::Physical(v, unit) => serializer.serialize_str(&format!("{v}{}", unit.suffix())),
            Length::Percent(p) => serializer.serialize_str(&format!("{p}%")),
            Length::Em(v) => serializer.serialize_str(&format!("{v}em")),
            Length::Rem(v) => serializer.serialize_str(&format!("{v}rem")),
        }
    }
}

#[cfg(test)]
mod tests;
