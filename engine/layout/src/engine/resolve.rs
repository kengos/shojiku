//! Resolve-pass primitives: thin `Ctx` bridges to the box-model math in
//! `shojiku-layout-box` (length/edge resolution, `ResolvedBox`), plus
//! the color/font sanity guards and the layered style resolver (engine
//! default <- inherited <- named styles <- inline).

use crate::color::{parse_color, snippet};
use crate::style::ComputedStyle;
use shojiku_core::{FontRel, Length, OptBox, Style, DEFAULT_FONT_SIZE_PT, MAX_STYLE_NAMES};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};
use shojiku_layout_box::ResolvedBox;

use super::{Basis, Ctx, BLACK};

/// Sanity bound on `letterSpacing` magnitude. Spacing is added to *every*
/// character advance, so a huge template value multiplies by the content
/// length and can overflow width math to non-finite; anything past this is
/// authoring garbage, not typography.
const MAX_LETTER_SPACING_PT: f64 = 1_000.0;

/// Sanity bound on `borderWidth`. A border wider than this is authoring
/// garbage (the A4 long edge is ~842pt); an absurd untrusted value would
/// feed the renderers' stroke math directly.
const MAX_BORDER_WIDTH_PT: f64 = 1_000.0;

impl<'a, 'b> Ctx<'a, 'b> {
    /// The font-relative bases at the current cascade point: `em` is the
    /// inherited font size, `rem` the document root style's computed
    /// font size (the engine default when no `defaults.style`
    /// sets one). Every `Basis` constructor calls this where its
    /// children's cascade is in effect, so an `em` box length means
    /// "the font size the item inherits".
    pub(super) fn font_rel(&self) -> FontRel {
        FontRel {
            em: self.inherited.font_size,
            rem: self.inherited.rem_root,
        }
    }

    /// Resolves a horizontal length (`x`/`w`) — see
    /// [`shojiku_layout_box::resolve_x`].
    pub(super) fn resolve_x(&mut self, len: Option<Length>, basis: &Basis) -> Option<f64> {
        shojiku_layout_box::resolve_x(len, basis, &mut self.diags)
    }

    /// Resolves a vertical length (`y`/`h`) — see
    /// [`shojiku_layout_box::resolve_y`].
    pub(super) fn resolve_y(&mut self, len: Option<Length>, basis: &Basis) -> Option<f64> {
        shojiku_layout_box::resolve_y(len, basis, &mut self.diags)
    }

    /// Resolves an item's box (margins, padding, border-box) — see
    /// [`ResolvedBox::resolve`].
    pub(super) fn resolve_box(&mut self, b: &OptBox, basis: &Basis) -> ResolvedBox {
        ResolvedBox::resolve(b, basis, &mut self.diags)
    }

    /// Resolves `page.margin` to pt `[top, right, bottom, left]` against
    /// the full page (`%` of the page *width* for every side, the CSS
    /// edge rule). Sides are non-negative by parse; a side past the
    /// resolve cap drops to 0 (`length_out_of_range`). Margins that
    /// consume a whole page dimension would leave a degenerate margin
    /// box — that axis falls back to 0 with a `page_margin_too_large`
    /// warning, so the coordinate origin always has positive room.
    pub(super) fn resolve_page_margin(&mut self, page_w: f64, page_h: f64) -> [f64; 4] {
        let full = Basis {
            x: 0.0,
            w: page_w,
            h: Some(page_h),
            font: self.font_rel(),
        };
        let mut m = [0.0; 4];
        let edges = self.input.template.page.margin.edges();
        for (side, len) in m.iter_mut().zip(edges) {
            *side = self.resolve_x(Some(len), &full).unwrap_or(0.0);
        }
        if m[3] + m[1] >= page_w {
            self.diags.push(
                Diagnostic::new(Code::PageMarginTooLarge)
                    .arg("axis", "left+right")
                    .arg("a", m[3])
                    .arg("b", m[1])
                    .arg("dimension", "width")
                    .arg("total", page_w),
            );
            m[1] = 0.0;
            m[3] = 0.0;
        }
        if m[0] + m[2] >= page_h {
            self.diags.push(
                Diagnostic::new(Code::PageMarginTooLarge)
                    .arg("axis", "top+bottom")
                    .arg("a", m[0])
                    .arg("b", m[2])
                    .arg("dimension", "height")
                    .arg("total", page_h),
            );
            m[0] = 0.0;
            m[2] = 0.0;
        }
        m
    }

    pub(super) fn color_or_black(&mut self, color: Option<&str>) -> (f32, f32, f32) {
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
    /// Templates are untrusted; zero/negative/non-finite sizes would
    /// corrupt every downstream measurement.
    pub(super) fn sane_font_size(&mut self, size: f64) -> f64 {
        if size.is_finite() && size > 0.0 {
            size
        } else {
            self.diags.push(
                Diagnostic::new(Code::InvalidFontSize)
                    .arg("value", size)
                    .arg("default", DEFAULT_FONT_SIZE_PT),
            );
            DEFAULT_FONT_SIZE_PT
        }
    }

    /// Same guard for the line-height multiplier.
    pub(super) fn sane_line_height(&mut self, multiplier: f64) -> f64 {
        if multiplier.is_finite() && multiplier > 0.0 {
            multiplier
        } else {
            self.diags.push(
                Diagnostic::new(Code::InvalidLineHeight)
                    .arg("value", multiplier)
                    .arg("default", 1.4),
            );
            1.4
        }
    }

    /// Guard for `letterSpacing`: negative is legal (CSS tightening), but
    /// the value is untrusted — non-finite or absurd magnitudes would
    /// poison every advance in the run, so they fall back to 0 with a
    /// diagnostic.
    pub(super) fn sane_letter_spacing(&mut self, spacing: f64) -> f64 {
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
    pub(super) fn sane_border_width(&mut self, width: f64) -> f64 {
        if width.is_finite() && (0.0..=MAX_BORDER_WIDTH_PT).contains(&width) {
            width
        } else {
            self.diags.push(
                Diagnostic::new(Code::InvalidBorderWidth)
                    .arg("value", width)
                    .arg("max", MAX_BORDER_WIDTH_PT),
            );
            0.0
        }
    }

    /// Guards a paint alpha (F2 `opacity`): `0..=1` passes through,
    /// anything else warns and draws opaque — a typo'd opacity silently
    /// hiding content would be worse than ignoring it. Template values are
    /// finite (yaml_guard), but the guard re-checks for defense in depth.
    pub(super) fn sane_opacity(&mut self, opacity: f64) -> f32 {
        if opacity.is_finite() && (0.0..=1.0).contains(&opacity) {
            opacity as f32
        } else {
            self.diags
                .push(Diagnostic::new(Code::InvalidOpacity).arg("value", opacity));
            1.0
        }
    }

    /// Resolves the font chain for a computed style, warning once per
    /// unknown `fontFamily` (AA3): `FontStore::resolve` falls back to the
    /// default face, which silently hid typos like `ipaexg` for
    /// `ipaex-gothic` while `styleNames` typos warned. Deduped per family
    /// so a list/table using the typo warns once, not per item.
    pub(super) fn resolved_chain(
        &mut self,
        computed: &ComputedStyle,
    ) -> crate::font::ResolvedChain<'a> {
        if let Some(family) = computed.font_family.as_deref() {
            if !self.input.fonts.has_family(family) && !self.warned_families.contains(family) {
                self.warned_families.insert(family.to_string());
                self.diags.push(
                    Diagnostic::new(Code::UnknownFontFamily)
                        .arg("family", crate::color::snippet(family)),
                );
            }
        }
        self.input.fonts.resolve_chain(
            computed.font_family.as_deref(),
            computed.font_weight,
            computed.font_style,
        )
    }

    /// Resolves an item's `styleNames` + inline `style` against the
    /// inherited context into a concrete [`ComputedStyle`]. Precedence
    /// low→high: inherited ancestor ← each named style in listed order
    /// (later wins) ← inline. Undefined names are skipped silently
    /// (`validate` reports them); the list is capped to bound the fold.
    pub(super) fn resolve_style(&self, names: &[String], inline: &Style) -> ComputedStyle {
        let mut computed = ComputedStyle::base(&self.inherited);
        for name in names.iter().take(MAX_STYLE_NAMES) {
            if let Some(style) = self.input.template.styles.get(name) {
                computed = computed.overlaid(style);
            }
        }
        computed.overlaid(inline)
    }
}
