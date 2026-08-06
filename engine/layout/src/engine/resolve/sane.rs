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
use shojiku_core::{DEFAULT_FONT_SIZE_PT, DEFAULT_LINE_HEIGHT, DEFAULT_STROKE_PT};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::super::{Ctx, BLACK};

/// Sanity bound on `letterSpacing` magnitude. Spacing is added to *every*
/// character advance, so a huge template value multiplies by the content
/// length and can overflow width math to non-finite; anything past this is
/// authoring garbage, not typography.
const MAX_LETTER_SPACING_PT: f64 = 1_000.0;

/// Sanity bound on a stroke width — `borderWidth` and the `line` item's
/// `style.width` alike, since both reach the renderers' stroke math
/// directly. A stroke wider than this is authoring garbage (the A4 long
/// edge is ~842pt).
const MAX_STROKE_WIDTH_PT: f64 = 1_000.0;

/// Sanity bound on `fontSize`. It is the one Length-shaped value the
/// box-resolution cap never sees — the cascade resolves it through
/// `Length::resolve`, not `resolve_x` — so without this a huge finite
/// size drives `size × lineHeight` and the advance sums toward
/// non-finite geometry. Paired with [`MAX_LINE_HEIGHT`] so the tallest
/// line box the guards admit is exactly `MAX_RESOLVED_PT`.
const MAX_FONT_SIZE_PT: f64 = 1_000.0;

/// Sanity bound on the `lineHeight` multiplier — see [`MAX_FONT_SIZE_PT`]
/// for why the pair is what matters.
const MAX_LINE_HEIGHT: f64 = 1_000.0;

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
        if !size.is_finite() || size <= 0.0 {
            self.diags.push(
                Diagnostic::new(Code::InvalidFontSize)
                    .arg("value", size)
                    .arg("default", DEFAULT_FONT_SIZE_PT),
            );
            return DEFAULT_FONT_SIZE_PT;
        }
        if size > MAX_FONT_SIZE_PT {
            self.diags.push(
                Diagnostic::new(Code::FontSizeOutOfRange)
                    .arg("value", size)
                    .arg("max", MAX_FONT_SIZE_PT)
                    .arg("default", DEFAULT_FONT_SIZE_PT),
            );
            return DEFAULT_FONT_SIZE_PT;
        }
        size
    }

    /// Same guard for the line-height multiplier.
    pub(in crate::engine) fn sane_line_height(&mut self, multiplier: f64) -> f64 {
        if !multiplier.is_finite() || multiplier <= 0.0 {
            self.diags.push(
                Diagnostic::new(Code::InvalidLineHeight)
                    .arg("value", multiplier)
                    .arg("default", DEFAULT_LINE_HEIGHT),
            );
            return DEFAULT_LINE_HEIGHT;
        }
        if multiplier > MAX_LINE_HEIGHT {
            self.diags.push(
                Diagnostic::new(Code::LineHeightOutOfRange)
                    .arg("value", multiplier)
                    .arg("max", MAX_LINE_HEIGHT)
                    .arg("default", DEFAULT_LINE_HEIGHT),
            );
            return DEFAULT_LINE_HEIGHT;
        }
        multiplier
    }

    /// Guard for `letterSpacing`: negative is legal (CSS tightening), but
    /// the value is untrusted — non-finite or absurd magnitudes would
    /// poison every advance in the run, so they fall back to 0 with a
    /// diagnostic.
    pub(in crate::engine) fn sane_letter_spacing(&mut self, spacing: f64) -> f64 {
        if spacing.is_finite() && spacing.abs() <= MAX_LETTER_SPACING_PT {
            spacing
        } else {
            self.diags.push(
                Diagnostic::new(Code::InvalidLetterSpacing)
                    .arg("value", spacing)
                    .arg("max", MAX_LETTER_SPACING_PT),
            );
            0.0
        }
    }

    /// Guard for `borderWidth`: `0` legitimately means "no border" (the
    /// initial value, checked without a diagnostic); negative, non-finite,
    /// or absurd widths fall back to 0 with a diagnostic.
    pub(in crate::engine) fn sane_border_width(&mut self, width: f64) -> f64 {
        if width.is_finite() && (0.0..=MAX_STROKE_WIDTH_PT).contains(&width) {
            width
        } else {
            self.diags.push(
                Diagnostic::new(Code::InvalidBorderWidth)
                    .arg("value", width)
                    .arg("max", MAX_STROKE_WIDTH_PT),
            );
            0.0
        }
    }

    /// Guard for the `line` item's stroke width. It shares `borderWidth`'s
    /// bound — both feed the same renderer stroke math — but NOT its
    /// fallback: `0` is `borderWidth`'s own initial value ("no border"),
    /// whereas a `line` that strokes nothing is an item drawing nothing,
    /// so a hostile width degrades to the wire default instead. An
    /// authored `0` still passes through undiagnosed.
    pub(in crate::engine) fn sane_line_width(&mut self, width: f64) -> f64 {
        if width.is_finite() && (0.0..=MAX_STROKE_WIDTH_PT).contains(&width) {
            width
        } else {
            self.diags.push(
                Diagnostic::new(Code::InvalidLineWidth)
                    .arg("value", width)
                    .arg("max", MAX_STROKE_WIDTH_PT)
                    .arg("default", DEFAULT_STROKE_PT),
            );
            DEFAULT_STROKE_PT
        }
    }

    /// Guards a paint alpha (`opacity`): `0..=1` passes through,
    /// anything else warns and draws opaque — a typo'd opacity silently
    /// hiding content would be worse than ignoring it. Template values are
    /// finite (yaml_guard), but the guard re-checks for defense in depth.
    pub(in crate::engine) fn sane_opacity(&mut self, opacity: f64) -> f32 {
        if opacity.is_finite() && (0.0..=1.0).contains(&opacity) {
            opacity as f32
        } else {
            self.diags
                .push(Diagnostic::new(Code::InvalidOpacity).arg("value", opacity));
            1.0
        }
    }
}
