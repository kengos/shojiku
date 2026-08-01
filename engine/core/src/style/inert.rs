//! Context-inert style keys: which authored properties have no effect on
//! a rich-text span or on a shape item, reported by wire name.
//!
//! Both lists back a validation diagnostic (`ignored_span_style` /
//! `shape_style_ignored`) so an authoring mistake is visible instead of a
//! silent no-op. Only the author's own inline style is walked — a named
//! style is a shared bag whose extra keys are legitimate elsewhere. Adding
//! a [`super::Style`] field means deciding whether it belongs in either
//! list.

use super::Style;

/// Keeps the wire names whose `(is_set, name)` pair is set, in listed
/// order — the diagnostic reports names only, never authored values.
fn ignored(checks: &[(bool, &'static str)]) -> Vec<&'static str> {
    checks
        .iter()
        .filter(|(set, _)| *set)
        .map(|(_, name)| *name)
        .collect()
}

impl Style {
    /// Wire names of the set properties that a rich-text span does NOT
    /// honor. Spans are text runs, not boxes: only `fontSize`,
    /// `fontFamily`, `fontWeight`, `fontStyle`, `letterSpacing`, `color`,
    /// `textDecoration`, and `textCombineUpright` (tate-chu-yoko per span) apply
    /// per span; everything else is block- or box-level and is silently
    /// inert there. Validation surfaces these
    /// (`ignored_span_style`) so the mistake is visible — the names, not
    /// the authored values, keep the diagnostic bounded.
    pub fn ignored_span_keys(&self) -> Vec<&'static str> {
        ignored(&[
            (self.line_height.is_some(), "lineHeight"),
            (self.text_align.is_some(), "textAlign"),
            (self.vertical_align.is_some(), "verticalAlign"),
            (self.line_break.is_some(), "lineBreak"),
            (self.text_spacing_trim.is_some(), "textSpacingTrim"),
            (self.hanging_punctuation.is_some(), "hangingPunctuation"),
            (self.background_color.is_some(), "backgroundColor"),
            (self.border_width.is_some(), "borderWidth"),
            (self.border_color.is_some(), "borderColor"),
            (self.border_style.is_some(), "borderStyle"),
            (self.border_radius.is_some(), "borderRadius"),
            (self.text_overflow.is_some(), "textOverflow"),
            (self.overflow.is_some(), "overflow"),
            (self.opacity.is_some(), "opacity"),
            (self.writing_mode.is_some(), "writingMode"),
            (self.text_orientation.is_some(), "textOrientation"),
        ])
    }

    /// Authored keys that have no effect on a shape item (`rect`/
    /// `ellipse`/`checkbox`/text `mark`): shapes honor only the box
    /// decoration subset — `backgroundColor`, `borderWidth`,
    /// `borderColor`, `borderStyle`, `borderRadius`, `opacity`.
    /// Validation surfaces the rest (`shape_style_ignored`) so a text key
    /// on a shape is a visible mistake, not a silent no-op. Like the span
    /// check, only the author's inline style is flagged — a named style is
    /// a shared bag. (`borderRadius` is absent here because `rect` honors
    /// it; the marks warn `border_radius_ignored` from layout instead,
    /// where the shape kind is known.)
    pub fn ignored_shape_keys(&self) -> Vec<&'static str> {
        ignored(&[
            (self.font_size.is_some(), "fontSize"),
            (self.font_family.is_some(), "fontFamily"),
            (self.font_weight.is_some(), "fontWeight"),
            (self.font_style.is_some(), "fontStyle"),
            (self.letter_spacing.is_some(), "letterSpacing"),
            (self.line_height.is_some(), "lineHeight"),
            (self.color.is_some(), "color"),
            (self.text_align.is_some(), "textAlign"),
            (self.vertical_align.is_some(), "verticalAlign"),
            (self.line_break.is_some(), "lineBreak"),
            (self.text_spacing_trim.is_some(), "textSpacingTrim"),
            (self.hanging_punctuation.is_some(), "hangingPunctuation"),
            (self.text_overflow.is_some(), "textOverflow"),
            (self.overflow.is_some(), "overflow"),
            (self.text_decoration.is_some(), "textDecoration"),
            (self.writing_mode.is_some(), "writingMode"),
            (self.text_orientation.is_some(), "textOrientation"),
            (self.text_combine_upright.is_some(), "textCombineUpright"),
        ])
    }
}
