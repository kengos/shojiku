//! [`StyleKey`] — one property of a [`Style`], as a value.
//!
//! The engine's per-key facts (`crate::facts`: inheritance, initial values,
//! ranges, which surfaces paint with a key) are keyed by it. Every match over
//! it is exhaustive, so a new [`Style`] field that gets a key here cannot be
//! left out of any of those tables silently — and a test holds the key set
//! equal to the fields the wire writes.

use super::Style;

#[cfg(test)]
mod tests;

/// The 24 properties of a [`Style`], in field order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum StyleKey {
    FontSize,
    FontFamily,
    LineHeight,
    Color,
    TextAlign,
    VerticalAlign,
    LineBreak,
    TextSpacingTrim,
    HangingPunctuation,
    BackgroundColor,
    BorderWidth,
    BorderColor,
    BorderStyle,
    BorderRadius,
    TextOverflow,
    FontWeight,
    FontStyle,
    LetterSpacing,
    Overflow,
    TextDecoration,
    Opacity,
    WritingMode,
    TextOrientation,
    TextCombineUpright,
}

impl StyleKey {
    /// Every key, in [`Style`]'s field order.
    pub const ALL: [StyleKey; 24] = [
        StyleKey::FontSize,
        StyleKey::FontFamily,
        StyleKey::LineHeight,
        StyleKey::Color,
        StyleKey::TextAlign,
        StyleKey::VerticalAlign,
        StyleKey::LineBreak,
        StyleKey::TextSpacingTrim,
        StyleKey::HangingPunctuation,
        StyleKey::BackgroundColor,
        StyleKey::BorderWidth,
        StyleKey::BorderColor,
        StyleKey::BorderStyle,
        StyleKey::BorderRadius,
        StyleKey::TextOverflow,
        StyleKey::FontWeight,
        StyleKey::FontStyle,
        StyleKey::LetterSpacing,
        StyleKey::Overflow,
        StyleKey::TextDecoration,
        StyleKey::Opacity,
        StyleKey::WritingMode,
        StyleKey::TextOrientation,
        StyleKey::TextCombineUpright,
    ];

    /// The wire spelling: the key as written under `style:`.
    pub fn as_str(self) -> &'static str {
        match self {
            StyleKey::FontSize => "fontSize",
            StyleKey::FontFamily => "fontFamily",
            StyleKey::LineHeight => "lineHeight",
            StyleKey::Color => "color",
            StyleKey::TextAlign => "textAlign",
            StyleKey::VerticalAlign => "verticalAlign",
            StyleKey::LineBreak => "lineBreak",
            StyleKey::TextSpacingTrim => "textSpacingTrim",
            StyleKey::HangingPunctuation => "hangingPunctuation",
            StyleKey::BackgroundColor => "backgroundColor",
            StyleKey::BorderWidth => "borderWidth",
            StyleKey::BorderColor => "borderColor",
            StyleKey::BorderStyle => "borderStyle",
            StyleKey::BorderRadius => "borderRadius",
            StyleKey::TextOverflow => "textOverflow",
            StyleKey::FontWeight => "fontWeight",
            StyleKey::FontStyle => "fontStyle",
            StyleKey::LetterSpacing => "letterSpacing",
            StyleKey::Overflow => "overflow",
            StyleKey::TextDecoration => "textDecoration",
            StyleKey::Opacity => "opacity",
            StyleKey::WritingMode => "writingMode",
            StyleKey::TextOrientation => "textOrientation",
            StyleKey::TextCombineUpright => "textCombineUpright",
        }
    }
}

impl Style {
    /// Whether this bag authors `key`.
    pub fn is_set(&self, key: StyleKey) -> bool {
        match key {
            StyleKey::FontSize => self.font_size.is_some(),
            StyleKey::FontFamily => self.font_family.is_some(),
            StyleKey::LineHeight => self.line_height.is_some(),
            StyleKey::Color => self.color.is_some(),
            StyleKey::TextAlign => self.text_align.is_some(),
            StyleKey::VerticalAlign => self.vertical_align.is_some(),
            StyleKey::LineBreak => self.line_break.is_some(),
            StyleKey::TextSpacingTrim => self.text_spacing_trim.is_some(),
            StyleKey::HangingPunctuation => self.hanging_punctuation.is_some(),
            StyleKey::BackgroundColor => self.background_color.is_some(),
            StyleKey::BorderWidth => self.border_width.is_some(),
            StyleKey::BorderColor => self.border_color.is_some(),
            StyleKey::BorderStyle => self.border_style.is_some(),
            StyleKey::BorderRadius => self.border_radius.is_some(),
            StyleKey::TextOverflow => self.text_overflow.is_some(),
            StyleKey::FontWeight => self.font_weight.is_some(),
            StyleKey::FontStyle => self.font_style.is_some(),
            StyleKey::LetterSpacing => self.letter_spacing.is_some(),
            StyleKey::Overflow => self.overflow.is_some(),
            StyleKey::TextDecoration => self.text_decoration.is_some(),
            StyleKey::Opacity => self.opacity.is_some(),
            StyleKey::WritingMode => self.writing_mode.is_some(),
            StyleKey::TextOrientation => self.text_orientation.is_some(),
            StyleKey::TextCombineUpright => self.text_combine_upright.is_some(),
        }
    }
}
