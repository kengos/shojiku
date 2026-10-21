//! Which surfaces paint with which style keys.
//!
//! Read from the layout code that consumes each key, not from the reference
//! prose. "Paints with" means a key authored on the surface's OWN `style:`
//! changes what that surface draws — its box decoration, its text, or for a
//! table its cells. A key that only reaches what a container holds, through
//! inheritance, is not listed here; [`takes`] adds that half.
//!
//! The surfaces are the item kinds, a rich-text span, a text mark and the
//! document root (`defaults.style`). A table's own layers — a column, the
//! row and its alternate, a conditional row style, the header and its groups
//! — are not covered yet.

use crate::ItemKind;
use crate::style::StyleKey;

/// Somewhere a [`crate::Style`] is authored: an item's `style:`, a
/// rich-text span's, a text mark's, or the template's `defaults.style`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Surface {
    Item(ItemKind),
    Span,
    Mark,
    /// `defaults.style`, the root every item's cascade starts from. It paints
    /// nothing itself; only its inherited keys reach the items.
    Document,
}

use ItemKind as K;
use Surface::{Item as I, Mark, Span};

/// The two surfaces laid out as a text block: plain text and a page number.
const BLOCK_TEXT: [Surface; 2] = [I(K::Text), I(K::PageNumber)];

/// Surfaces that paint a fill and a border.
const FILLED: [Surface; 11] = [
    I(K::Text),
    I(K::PageNumber),
    I(K::List),
    I(K::Rect),
    I(K::Image),
    I(K::QrCode),
    I(K::Container),
    I(K::CharGrid),
    I(K::Ellipse),
    I(K::Checkbox),
    Mark,
];

/// The box-decoration painters that also take a border pattern and a
/// radius. A form mark draws its outline as one stroke, and a character
/// grid's border is its ruling.
const BOXES: [Surface; 7] = [
    I(K::Text),
    I(K::PageNumber),
    I(K::List),
    I(K::Rect),
    I(K::Image),
    I(K::QrCode),
    I(K::Container),
];

/// The surfaces that paint with `key` authored on their own `style:`.
pub fn painted_by(key: StyleKey) -> &'static [Surface] {
    match key {
        // A character grid's glyphs; a span's run.
        StyleKey::FontSize
        | StyleKey::FontFamily
        | StyleKey::Color
        | StyleKey::FontWeight
        | StyleKey::FontStyle
        | StyleKey::TextCombineUpright => &[
            I(K::Text),
            I(K::PageNumber),
            I(K::List),
            I(K::CharGrid),
            Span,
        ],
        StyleKey::LetterSpacing | StyleKey::TextDecoration => {
            &[I(K::Text), I(K::PageNumber), I(K::List), Span]
        }
        StyleKey::LineHeight | StyleKey::WritingMode | StyleKey::TextOrientation => {
            &[I(K::Text), I(K::PageNumber), I(K::List)]
        }
        StyleKey::TextAlign => &[I(K::Text), I(K::PageNumber), I(K::List), I(K::CharGrid)],
        // A table's own value is its cells' fallback.
        StyleKey::VerticalAlign => &[I(K::Text), I(K::PageNumber), I(K::Table)],
        StyleKey::LineBreak
        | StyleKey::TextSpacingTrim
        | StyleKey::HangingPunctuation
        | StyleKey::TextOverflow => &BLOCK_TEXT,
        StyleKey::BackgroundColor | StyleKey::Opacity => &FILLED,
        // A table's border is its grid and outer frame.
        StyleKey::BorderWidth | StyleKey::BorderColor => &[
            I(K::Text),
            I(K::PageNumber),
            I(K::List),
            I(K::Rect),
            I(K::Image),
            I(K::QrCode),
            I(K::Container),
            I(K::CharGrid),
            I(K::Ellipse),
            I(K::Checkbox),
            Mark,
            I(K::Table),
        ],
        // A table reads the pattern only for a per-side `borderWidth`, which
        // draws its outer frame; its inner grid is always solid.
        StyleKey::BorderStyle => &[
            I(K::Text),
            I(K::PageNumber),
            I(K::List),
            I(K::Rect),
            I(K::Image),
            I(K::QrCode),
            I(K::Container),
            I(K::Table),
        ],
        StyleKey::BorderRadius => &BOXES,
        StyleKey::Overflow => &[I(K::Container)],
    }
}

/// Whether `surface` holds content its own style cascades into: a
/// container's children, a table's cells, every item under the document
/// root. A `char_grid` reads its font size and alignment from its own style
/// only, so an inherited one does not reach it.
pub fn holds_content(surface: Surface) -> bool {
    matches!(surface, I(K::Container) | I(K::Table) | Surface::Document)
}

/// Whether authoring `key` on `surface`'s own `style:` changes the output:
/// the surface paints with it, or it inherits into content the surface
/// holds.
pub fn takes(surface: Surface, key: StyleKey) -> bool {
    painted_by(key).contains(&surface) || (super::inherits(key) && holds_content(surface))
}
