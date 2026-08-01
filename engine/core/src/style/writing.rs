//! Writing-mode vocabulary: line direction (`writing-mode`), the character
//! orientation within a vertical line (`text-orientation`), and tate-chu-yoko
//! digit combining (`text-combine-upright`). All mirror the CSS properties
//! of the same names, snake_case on the wire. Split from the keyword
//! [`super::enums`] so the writing-direction family lives together;
//! re-exported from the module root so `shojiku_core::WritingMode` paths
//! stay stable.

use serde::de::{self, Deserializer, MapAccess, Visitor};
use serde::{Deserialize, Serialize, Serializer};
use std::fmt;

/// Line direction, mirroring a subset of the CSS `writing-mode` property.
/// Inherited through the container tree; the engine default is
/// [`WritingMode::HorizontalTb`], so templates authored before vertical
/// writing existed are unaffected.
///
/// This is shared vocabulary: a `char_grid` item carries its own
/// `writingMode` (the genkoyoshi grid direction), and it is also a `style`
/// property that turns a plain `type: text` item into a vertical block.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WritingMode {
    /// Horizontal lines stacked top→bottom (Latin). The engine
    /// default. CSS `horizontal-tb`.
    #[default]
    HorizontalTb,
    /// Vertical lines (columns) filled top→bottom and advancing
    /// right→left (the genkoyoshi default in print). CSS
    /// `vertical-rl`.
    VerticalRl,
}

/// How characters are oriented within a vertical line, mirroring a subset
/// of the CSS `text-orientation` property. Inherited. Only consulted when
/// the effective [`WritingMode`] is vertical; inert in horizontal text.
/// The engine default is [`TextOrientation::Mixed`], matching CSS.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TextOrientation {
    /// Upright CJK, with non-CJK runs (Latin digits/letters) rotated 90°
    /// clockwise so they read top-to-bottom. The engine default. CSS
    /// `mixed`.
    #[default]
    Mixed,
    /// Every character upright, including Latin — used for short vertical
    /// labels where rotated Latin would read awkwardly. CSS `upright`.
    Upright,
}

/// Tate-chu-yoko: combining text into one upright cell of a
/// vertical line, mirroring a subset of the CSS `text-combine-upright`
/// property. Inherited; inert in horizontal text. Three authored forms
/// round-trip: the keywords `none` and `all` and the map `{ digits: N }`
/// (CSS `digits <integer>`, N in 2..=4 — anything else is a located
/// parse error, never a silent clamp).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum TextCombineUpright {
    /// No combining — every digit occupies its own cell. The engine
    /// default. CSS `none`.
    #[default]
    None,
    /// Runs of up to N consecutive ASCII digits share one upright cell
    /// (a year "2026" or a day "31" reads horizontally within the
    /// column). CSS `digits N`.
    Digits(u8),
    /// The WHOLE content of the styled scope shares one upright cell —
    /// meant for a short span (a date span combined as one cell). CSS
    /// `all`. Compress-only, like `digits`; a long content still
    /// terminates (it compresses, unreadably, into its 1em cell).
    All,
}

/// An ACTIVE combining mode — [`TextCombineUpright`] minus its `none`
/// arm, so layout/tree carriers never hold a meaningless
/// `Some(None)`. Serializes as the authored forms (`{ digits: N }` /
/// `all`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TextCombine {
    /// See [`TextCombineUpright::Digits`].
    Digits(u8),
    /// See [`TextCombineUpright::All`].
    All,
}

impl TextCombineUpright {
    /// The active combining mode, if combining is on.
    pub fn active(self) -> Option<TextCombine> {
        match self {
            TextCombineUpright::None => None,
            TextCombineUpright::Digits(n) => Some(TextCombine::Digits(n)),
            TextCombineUpright::All => Some(TextCombine::All),
        }
    }

    /// Digit-run length to combine, if digit-run combining is on —
    /// the `char_grid` arm, whose per-cell model combines digit RUNS
    /// only (`all` does not apply to a grid of cells).
    pub fn digits(self) -> Option<u8> {
        match self {
            TextCombineUpright::Digits(n) => Some(n),
            _ => None,
        }
    }
}

impl Serialize for TextCombineUpright {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        match self {
            TextCombineUpright::None => s.serialize_str("none"),
            TextCombineUpright::All => s.serialize_str("all"),
            // Single-expression map form: serializing our own scalar can
            // never fail, so no `?` error region exists to cover.
            TextCombineUpright::Digits(n) => s.collect_map(std::iter::once(("digits", *n))),
        }
    }
}

impl<'de> Deserialize<'de> for TextCombineUpright {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        d.deserialize_any(CombineVisitor)
    }
}

/// Keyword-or-map visitor: `none` / `all`, or a `{ digits: N }` map. The
/// generic methods are single-path shims over the MONOMORPHIC
/// [`keyword`]/[`digits_form`] helpers — branching inside a generic fn
/// leaves per-instantiation lines the coverage gate counts copy by copy.
struct CombineVisitor;

impl<'de> Visitor<'de> for CombineVisitor {
    type Value = TextCombineUpright;

    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("`none`, `all`, or a map `{ digits: 2..=4 }`")
    }

    fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
        keyword(v).map_err(E::custom)
    }

    fn visit_map<A: MapAccess<'de>>(self, map: A) -> Result<Self::Value, A::Error> {
        let form = DigitsForm::deserialize(de::value::MapAccessDeserializer::new(map))?;
        digits_form(form.digits).map_err(de::Error::custom)
    }
}

/// The `{ digits: N }` wire form — the derive supplies the located
/// unknown-key / duplicate-key / missing-field errors.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DigitsForm {
    digits: u8,
}

/// The keyword forms: `none` and `all`.
fn keyword(v: &str) -> Result<TextCombineUpright, String> {
    match v {
        "none" => Ok(TextCombineUpright::None),
        "all" => Ok(TextCombineUpright::All),
        other => Err(format!(
            "unknown textCombineUpright keyword `{other}`; use `none`, `all`, or `{{ digits: N }}`"
        )),
    }
}

/// The digits range gate: CSS `digits <integer>` allows 2..=4.
fn digits_form(n: u8) -> Result<TextCombineUpright, String> {
    if (2..=4).contains(&n) {
        Ok(TextCombineUpright::Digits(n))
    } else {
        Err(format!("textCombineUpright digits must be 2..=4, got {n}"))
    }
}
