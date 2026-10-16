//! The value each style key takes when nothing authors it — the CSS
//! "initial" value every cascade starts from at the document root.

use super::Surface;
use crate::length::DEFAULT_FONT_SIZE_PT;
use crate::style::{StyleKey, DEFAULT_LINE_HEIGHT, DEFAULT_STROKE_PT};
use crate::ItemKind;

/// An initial value, in its wire form.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Initial {
    /// A number (a length in pt, a multiplier, an alpha).
    Number(f64),
    /// A keyword or a colour, spelled as the wire spells it.
    Keyword(&'static str),
    /// No fixed value: the surface derives it (a character grid sizes its
    /// glyphs from the cell). Only [`surface_initial`] answers this.
    FromSurface,
}

impl Initial {
    /// The value as JSON — which is also its YAML spelling. `null` for
    /// [`Initial::FromSurface`].
    pub fn to_json(self) -> serde_json::Value {
        match self {
            Initial::Number(n) => serde_json::json!(n),
            Initial::Keyword(k) => serde_json::json!(k),
            Initial::FromSurface => serde_json::Value::Null,
        }
    }
}

/// What `key` resolves to at the document root when no layer authors it.
/// `None` where the absence is itself the value: no font family (the font
/// chain decides), no fill, no radius. A few surfaces start a key elsewhere;
/// [`surface_initial`] lists them.
pub fn initial(key: StyleKey) -> Option<Initial> {
    use Initial::{Keyword, Number};
    match key {
        StyleKey::FontSize => Some(Number(DEFAULT_FONT_SIZE_PT)),
        StyleKey::LineHeight => Some(Number(DEFAULT_LINE_HEIGHT)),
        StyleKey::Color | StyleKey::BorderColor => Some(Keyword("#000000")),
        StyleKey::TextAlign => Some(Keyword("left")),
        StyleKey::VerticalAlign => Some(Keyword("top")),
        StyleKey::LineBreak | StyleKey::FontWeight | StyleKey::FontStyle => Some(Keyword("normal")),
        StyleKey::TextSpacingTrim => Some(Keyword("space_all")),
        StyleKey::HangingPunctuation | StyleKey::TextDecoration | StyleKey::TextCombineUpright => {
            Some(Keyword("none"))
        }
        StyleKey::BorderWidth | StyleKey::LetterSpacing => Some(Number(0.0)),
        StyleKey::BorderStyle => Some(Keyword("solid")),
        StyleKey::TextOverflow | StyleKey::Overflow => Some(Keyword("visible")),
        StyleKey::Opacity => Some(Number(1.0)),
        StyleKey::WritingMode => Some(Keyword("horizontal_tb")),
        StyleKey::TextOrientation => Some(Keyword("mixed")),
        StyleKey::FontFamily | StyleKey::BackgroundColor | StyleKey::BorderRadius => None,
    }
}

/// The `line` item's stroke style, which is not a [`crate::Style`]: each
/// of its four keys with the value it takes when unauthored.
pub fn line_initial() -> [(&'static str, Initial); 4] {
    [
        ("width", Initial::Number(DEFAULT_STROKE_PT)),
        ("color", Initial::Keyword("#000000")),
        ("opacity", Initial::Number(1.0)),
        ("style", Initial::Keyword("solid")),
    ]
}

/// Where `surface` starts `key` somewhere other than [`initial`], when its
/// own style leaves it unset. A form mark strokes its outline at 1pt; a
/// table and a character grid draw a 0.5pt grid; a table's cells sit in the
/// middle; a character grid sizes its glyphs from the cell, which no fixed
/// value states ([`Initial::FromSurface`]).
pub fn surface_initial(surface: Surface, key: StyleKey) -> Option<Initial> {
    use ItemKind as K;
    match (surface, key) {
        (Surface::Item(K::Ellipse | K::Checkbox) | Surface::Mark, StyleKey::BorderWidth) => {
            Some(Initial::Number(MARK_STROKE_PT))
        }
        (Surface::Item(K::Table | K::CharGrid), StyleKey::BorderWidth) => {
            Some(Initial::Number(GRID_STROKE_PT))
        }
        (Surface::Item(K::Table), StyleKey::VerticalAlign) => Some(Initial::Keyword("middle")),
        (Surface::Item(K::CharGrid), StyleKey::FontSize) => Some(Initial::FromSurface),
        _ => None,
    }
}

/// A form mark's outline width when its style authors none.
pub const MARK_STROKE_PT: f64 = 1.0;

/// A table's and a character grid's ruling width when the style authors
/// none.
pub const GRID_STROKE_PT: f64 = 0.5;
