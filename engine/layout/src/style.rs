//! The style cascade: resolving authored [`Style`]s against inherited
//! context into a fully concrete [`ComputedStyle`].
//!
//! Core models appearance as [`Style`] — a bag of *optional* properties
//! where unset means "inherit, else engine default". Layout turns that into
//! a [`ComputedStyle`] with every field concrete, which then feeds the
//! renderer tree unchanged. Precedence, low → high: engine default ←
//! inherited (ancestor) ← named styles in listed order (later wins) ←
//! inline. The fold is built from two primitives: [`ComputedStyle::base`]
//! (start from the inherited context) then [`ComputedStyle::overlaid`]
//! (apply one [`Style`] layer). Inherited properties fall back to the
//! ancestor's computed value; non-inherited ones (`verticalAlign`,
//! `backgroundColor`, the border properties) reset to the initial value,
//! never the ancestor — matching CSS. The layered resolver over the registry lives in `engine`
//! (it needs the template's `styles`); this module is the pure algebra.

use shojiku_core::{
    BorderStyleKind, FontRel, FontStyle, FontWeight, HangingPunctuation, Length, LineBreak,
    Overflow, Style, TextAlign, TextCombineUpright, TextDecoration, TextOrientation, TextOverflow,
    TextSpacingTrim, VerticalAlign, WritingMode, DEFAULT_FONT_SIZE_PT, DEFAULT_LINE_HEIGHT,
};

/// A fully resolved style: every property concrete, ready for measurement
/// and drawing. Font size and line height are still sanity-clamped at use
/// (`sane_font_size`/`sane_line_height`) since inherited values can be
/// hostile.
#[derive(Debug, Clone, PartialEq)]
pub struct ComputedStyle {
    pub font_size: f64,
    /// The `rem` root in pt: the document root style's computed font
    /// Size, the engine default when no root style sets one.
    /// Carried through `base` like an inherited property so every
    /// cascade level and `Basis` sees the same root.
    pub rem_root: f64,
    /// Font face id; `None` uses the pack's default face.
    pub font_family: Option<String>,
    /// Line height as a multiplier of font size.
    pub line_height: f64,
    /// Text color as `#rrggbb`; `None` draws black.
    pub color: Option<String>,
    pub text_align: TextAlign,
    pub vertical_align: VerticalAlign,
    pub line_break: LineBreak,
    /// Fullwidth-punctuation spacing (CSS `text-spacing-trim`).
    /// Inherited. Default [`TextSpacingTrim::SpaceAll`] = no trimming.
    pub text_spacing_trim: TextSpacingTrim,
    /// Hanging punctuation (CSS `hanging-punctuation`).
    /// Inherited. Default [`HangingPunctuation::None`].
    pub hanging_punctuation: HangingPunctuation,
    /// Fill color drawn behind the box as `#rrggbb`; `None` = no fill. Not
    /// inherited.
    pub background_color: Option<String>,
    /// Border stroke widths in pt, `[top, right, bottom, left]`; `0.0` =
    /// that side draws nothing (the initial value). Not inherited.
    /// Sanity-clamped at use (`sane_border_width`).
    pub border_widths: [f64; 4],
    /// Border stroke colors as `#rrggbb`, `[top, right, bottom, left]`;
    /// `None` draws black. Not inherited, inert where the width is 0.
    pub border_colors: [Option<String>; 4],
    /// Border line styles, `[top, right, bottom, left]`: `double`
    /// splits the side's width into two lines of a third each. Not
    /// inherited.
    pub border_styles: [BorderStyleKind; 4],
    /// Corner rounding of the border box (CSS `border-radius`), still in
    /// its authored [`Length`] form: `%` resolves against BOTH box axes
    /// independently at emit time, so it cannot be reduced to one pt
    /// value during the cascade. Not inherited; `None` = square.
    pub border_radius: Option<Length>,
    /// Overflow policy for text in a definite-height box. Not inherited;
    /// inert on auto-height boxes (they grow to fit).
    pub text_overflow: TextOverflow,
    /// Font weight; `Bold` renders as synthetic emboldening (no bold face
    /// variants are bundled). Inherited.
    pub font_weight: FontWeight,
    /// Font slant; `Italic` renders as a synthetic skew. Inherited.
    pub font_style: FontStyle,
    /// Extra advance after every character, in pt. Inherited; negative
    /// tightens. Sanity-clamped at use (`sane_letter_spacing`).
    pub letter_spacing: f64,
    /// What the box does with content outside its border box (D2). Not
    /// inherited; `Hidden` wraps the box's children in a clip node.
    pub overflow: Overflow,
    /// Decoration line on text (F2). Not inherited (matches CSS —
    /// decoration *propagation* is not modeled). Position/thickness come
    /// from the font's metrics at emit time.
    pub text_decoration: TextDecoration,
    /// Paint alpha `0..=1` (F2). Not inherited; per-item paint alpha, not
    /// CSS group compositing. Sanity-clamped at use (`sane_opacity`).
    pub opacity: f64,
    /// Line direction (CSS `writing-mode`). Inherited. `VerticalRl` builds
    /// a plain text item as a vertical block; default
    /// [`WritingMode::HorizontalTb`].
    pub writing_mode: WritingMode,
    /// Character orientation within a vertical line (CSS
    /// `text-orientation`). Inherited. Consulted only when `writing_mode`
    /// is vertical; default [`TextOrientation::Mixed`].
    pub text_orientation: TextOrientation,
    /// tate-chu-yoko digit combining (CSS `text-combine-upright` subset).
    /// Inherited. Consulted only when `writing_mode` is vertical (or in a
    /// vertical `char_grid`); default [`TextCombineUpright::None`].
    pub text_combine_upright: TextCombineUpright,
}

impl Default for ComputedStyle {
    /// The engine defaults — the CSS "initial" values every cascade starts
    /// from at the document root.
    fn default() -> Self {
        Self {
            font_size: DEFAULT_FONT_SIZE_PT,
            rem_root: DEFAULT_FONT_SIZE_PT,
            font_family: None,
            line_height: DEFAULT_LINE_HEIGHT,
            color: None,
            text_align: TextAlign::Left,
            vertical_align: VerticalAlign::Top,
            line_break: LineBreak::Normal,
            text_spacing_trim: TextSpacingTrim::SpaceAll,
            hanging_punctuation: HangingPunctuation::None,
            background_color: None,
            border_widths: [0.0; 4],
            border_colors: [None, None, None, None],
            border_styles: [BorderStyleKind::Solid; 4],
            border_radius: None,
            text_overflow: TextOverflow::Visible,
            font_weight: FontWeight::Normal,
            font_style: FontStyle::Normal,
            letter_spacing: 0.0,
            overflow: Overflow::Visible,
            text_decoration: TextDecoration::None,
            opacity: 1.0,
            writing_mode: WritingMode::HorizontalTb,
            text_orientation: TextOrientation::Mixed,
            text_combine_upright: TextCombineUpright::None,
        }
    }
}

impl ComputedStyle {
    /// The starting point for resolving an item's style: inherited
    /// properties (`color`, `fontSize`, `fontFamily`, `fontWeight`,
    /// `fontStyle`, `letterSpacing`, `lineHeight`, `textAlign`,
    /// `lineBreak`) carry the ancestor's computed value, while
    /// non-inherited ones (`verticalAlign`, `backgroundColor`,
    /// `borderWidth`, `borderColor`) reset to the initial value so they
    /// never flow down the tree.
    pub fn base(inherited: &ComputedStyle) -> ComputedStyle {
        ComputedStyle {
            font_size: inherited.font_size,
            rem_root: inherited.rem_root,
            font_family: inherited.font_family.clone(),
            line_height: inherited.line_height,
            color: inherited.color.clone(),
            text_align: inherited.text_align,
            line_break: inherited.line_break,
            text_spacing_trim: inherited.text_spacing_trim,
            hanging_punctuation: inherited.hanging_punctuation,
            font_weight: inherited.font_weight,
            font_style: inherited.font_style,
            letter_spacing: inherited.letter_spacing,
            writing_mode: inherited.writing_mode,
            text_orientation: inherited.text_orientation,
            text_combine_upright: inherited.text_combine_upright,
            // Non-inherited: initial value, never the ancestor's.
            ..ComputedStyle::default()
        }
    }

    /// Overlays one authored [`Style`] on top of `self`: each property the
    /// layer sets wins; unset properties keep the value beneath. Applied in
    /// listed order so a later layer (or the inline `style`) wins.
    #[must_use]
    pub fn overlaid(mut self, layer: &Style) -> ComputedStyle {
        if let Some(v) = layer.font_size {
            // `em`/`%` on fontSize resolve against the value beneath (the
            // inherited size, per CSS), so nested relative sizes multiply;
            // `rem` against the engine default. Resolved first so a
            // same-layer `letterSpacing: em` below sees the new size.
            self.font_size = v.resolve(
                self.font_size,
                FontRel {
                    em: self.font_size,
                    rem: self.rem_root,
                },
            );
        }
        if let Some(v) = &layer.font_family {
            self.font_family = Some(v.clone());
        }
        if let Some(v) = layer.line_height {
            self.line_height = v;
        }
        if let Some(v) = &layer.color {
            self.color = Some(v.clone());
        }
        if let Some(v) = layer.text_align {
            self.text_align = v;
        }
        if let Some(v) = layer.vertical_align {
            self.vertical_align = v;
        }
        if let Some(v) = layer.line_break {
            self.line_break = v;
        }
        if let Some(v) = layer.text_spacing_trim {
            self.text_spacing_trim = v;
        }
        if let Some(v) = layer.hanging_punctuation {
            self.hanging_punctuation = v;
        }
        if let Some(v) = &layer.background_color {
            self.background_color = Some(v.clone());
        }
        if let Some(v) = &layer.border_width {
            self.border_widths = v.sides();
        }
        if let Some(v) = &layer.border_color {
            self.border_colors = v.sides();
        }
        if let Some(v) = &layer.border_style {
            self.border_styles = v.sides();
        }
        if let Some(v) = layer.border_radius {
            self.border_radius = Some(v);
        }
        if let Some(v) = layer.text_overflow {
            self.text_overflow = v;
        }
        if let Some(v) = layer.font_weight {
            self.font_weight = v;
        }
        if let Some(v) = layer.font_style {
            self.font_style = v;
        }
        if let Some(v) = layer.letter_spacing {
            // `em` letter-spacing tracks the element's own font size (the
            // fontSize overlay above already ran). `%` is parse-rejected;
            // a hand-constructed Percent degrades to 0 via the 0.0 basis.
            self.letter_spacing = v.resolve(
                0.0,
                FontRel {
                    em: self.font_size,
                    rem: self.rem_root,
                },
            );
        }
        if let Some(v) = layer.overflow {
            self.overflow = v;
        }
        if let Some(v) = layer.text_decoration {
            self.text_decoration = v;
        }
        if let Some(v) = layer.opacity {
            self.opacity = v;
        }
        if let Some(v) = layer.writing_mode {
            self.writing_mode = v;
        }
        if let Some(v) = layer.text_orientation {
            self.text_orientation = v;
        }
        if let Some(v) = layer.text_combine_upright {
            self.text_combine_upright = v;
        }
        self
    }
}

#[cfg(test)]
mod tests;
