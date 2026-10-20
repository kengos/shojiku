//! Which style keys inherit: the CSS split, as the layout cascade applies it.

use crate::style::StyleKey;

/// Whether `key` flows from an ancestor to the items it holds. A key that
/// does not inherit starts every item at its [`super::initial`] value.
pub fn inherits(key: StyleKey) -> bool {
    match key {
        StyleKey::FontSize
        | StyleKey::FontFamily
        | StyleKey::LineHeight
        | StyleKey::Color
        | StyleKey::TextAlign
        | StyleKey::LineBreak
        | StyleKey::TextSpacingTrim
        | StyleKey::HangingPunctuation
        | StyleKey::FontWeight
        | StyleKey::FontStyle
        | StyleKey::LetterSpacing
        | StyleKey::WritingMode
        | StyleKey::TextOrientation
        | StyleKey::TextCombineUpright => true,
        StyleKey::VerticalAlign
        | StyleKey::BackgroundColor
        | StyleKey::BorderWidth
        | StyleKey::BorderColor
        | StyleKey::BorderStyle
        | StyleKey::BorderRadius
        | StyleKey::TextOverflow
        | StyleKey::Overflow
        | StyleKey::TextDecoration
        | StyleKey::Opacity => false,
    }
}
