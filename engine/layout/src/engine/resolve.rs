//! Resolve-pass primitives: thin `Ctx` bridges to the box-model math in
//! `shojiku-layout-box` (length/edge resolution, `ResolvedBox`), the page
//! margin resolution, and the layered style resolver (engine default <-
//! inherited <- named styles <- inline). The per-scalar sanity guards
//! those layers feed live in [`sane`].

use crate::style::ComputedStyle;
use shojiku_core::{FontRel, Length, OptBox, Style, MAX_STYLE_NAMES};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};
use shojiku_layout_box::ResolvedBox;

use super::{Basis, Ctx};

mod sane;

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
            pct_w: None,
            fill_h: None,
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
