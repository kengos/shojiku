//! Sanity guards over the style scalars a template can set to anything:
//! color, font size, line height, letter spacing, and the two stroke
//! widths. Templates are untrusted, so every guard degrades to a
//! diagnostic + a usable fallback rather than letting a hostile value
//! into the measurement and stroke math.
//!
//! The guards run at USE, not in the cascade: [`ComputedStyle`] keeps the
//! inherited value verbatim (an ancestor's size can be hostile too), and
//! every consumer funnels through these methods.

use crate::color::{parse_color, snippet};
use shojiku_core::facts::{
    BORDER_WIDTH, FONT_SIZE, LETTER_SPACING, LINE_HEIGHT, LINE_WIDTH, OPACITY,
};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::super::{Ctx, BLACK};

// The bounds and fallbacks are `shojiku_core::facts`'s range table, which
// the key catalog publishes too, so a bound is written once. Font size and
// line height cap at 1000 each, so their PRODUCT — the tallest line box the
// guards admit — is exactly `MAX_RESOLVED_PT`; one stroke cap bounds both
// `borderWidth` and the `line` width, since both reach the renderers'
// stroke math directly.

impl Ctx<'_, '_> {
    pub(in crate::engine) fn color_or_black(&mut self, color: Option<&str>) -> (f32, f32, f32) {
        match color {
            None => BLACK,
            Some(c) => match parse_color(c) {
                Some(rgb) => rgb,
                None => {
                    self.diags.push(
                        Diagnostic::new(Code::InvalidColor)
                            .arg("value", snippet(c))
                            .arg("fallback", "using black"),
                    );
                    BLACK
                }
            },
        }
    }

    /// Clamps a template-supplied font size to something renderable.
    /// Zero/negative/non-finite sizes would corrupt every downstream
    /// measurement; sizes past the cap would drive the line-box and
    /// advance math off the scale the rest of the engine resolves.
    pub(in crate::engine) fn sane_font_size(&mut self, size: f64) -> f64 {
        if !FONT_SIZE.clears_min(size) {
            self.diags.push(
                Diagnostic::new(Code::InvalidFontSize)
                    .arg("value", size)
                    .arg("default", FONT_SIZE.fallback),
            );
            return FONT_SIZE.fallback;
        }
        if size > FONT_SIZE.max {
            self.diags.push(
                Diagnostic::new(Code::FontSizeOutOfRange)
                    .arg("value", size)
                    .arg("max", FONT_SIZE.max)
                    .arg("default", FONT_SIZE.fallback),
            );
            return FONT_SIZE.fallback;
        }
        size
    }

    /// Same guard for the line-height multiplier.
    pub(in crate::engine) fn sane_line_height(&mut self, multiplier: f64) -> f64 {
        if !LINE_HEIGHT.clears_min(multiplier) {
            self.diags.push(
                Diagnostic::new(Code::InvalidLineHeight)
                    .arg("value", multiplier)
                    .arg("default", LINE_HEIGHT.fallback),
            );
            return LINE_HEIGHT.fallback;
        }
        if multiplier > LINE_HEIGHT.max {
            self.diags.push(
                Diagnostic::new(Code::LineHeightOutOfRange)
                    .arg("value", multiplier)
                    .arg("max", LINE_HEIGHT.max)
                    .arg("default", LINE_HEIGHT.fallback),
            );
            return LINE_HEIGHT.fallback;
        }
        multiplier
    }

    /// Guard for `letterSpacing`: negative is legal (CSS tightening), but
    /// the value is untrusted — non-finite or absurd magnitudes would
    /// poison every advance in the run, so they fall back to 0 with a
    /// diagnostic.
    pub(in crate::engine) fn sane_letter_spacing(&mut self, spacing: f64) -> f64 {
        if LETTER_SPACING.admits(spacing) {
            spacing
        } else {
            self.diags.push(
                Diagnostic::new(Code::InvalidLetterSpacing)
                    .arg("value", spacing)
                    .arg("max", LETTER_SPACING.max),
            );
            LETTER_SPACING.fallback
        }
    }

    /// Guard for `borderWidth`: `0` legitimately means "no border" (the
    /// initial value, checked without a diagnostic); negative, non-finite,
    /// or absurd widths fall back to 0 with a diagnostic.
    pub(in crate::engine) fn sane_border_width(&mut self, width: f64) -> f64 {
        if BORDER_WIDTH.admits(width) {
            width
        } else {
            self.diags.push(
                Diagnostic::new(Code::InvalidBorderWidth)
                    .arg("value", width)
                    .arg("max", BORDER_WIDTH.max),
            );
            BORDER_WIDTH.fallback
        }
    }

    /// Guard for the `line` item's stroke width. It shares `borderWidth`'s
    /// bound — both feed the same renderer stroke math — but NOT its
    /// fallback: `0` is `borderWidth`'s own initial value ("no border"),
    /// whereas a `line` that strokes nothing is an item drawing nothing,
    /// so a hostile width degrades to the wire default instead. An
    /// authored `0` still passes through undiagnosed.
    pub(in crate::engine) fn sane_line_width(&mut self, width: f64) -> f64 {
        if LINE_WIDTH.admits(width) {
            width
        } else {
            self.diags.push(
                Diagnostic::new(Code::InvalidLineWidth)
                    .arg("value", width)
                    .arg("max", LINE_WIDTH.max)
                    .arg("default", LINE_WIDTH.fallback),
            );
            LINE_WIDTH.fallback
        }
    }

    /// Guards a paint alpha (`opacity`): `0..=1` passes through,
    /// anything else warns and draws opaque — a typo'd opacity silently
    /// hiding content would be worse than ignoring it. Template values are
    /// finite (the YAML door), but the guard re-checks for defense in depth.
    pub(in crate::engine) fn sane_opacity(&mut self, opacity: f64) -> f32 {
        if OPACITY.admits(opacity) {
            opacity as f32
        } else {
            self.diags
                .push(Diagnostic::new(Code::InvalidOpacity).arg("value", opacity));
            OPACITY.fallback as f32
        }
    }
}
