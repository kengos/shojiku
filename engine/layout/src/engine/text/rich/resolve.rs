//! Span resolution for rich blocks: per-span style cascade, content
//! binding, font chains, the MAX_SPANS layout guard, the shared
//! missing-glyph budget, and the block-wide uniform grid.

use crate::style::ComputedStyle;
use shojiku_core::{FontStyle, FontWeight, Style, TextItem, MAX_SPANS, MAX_STYLE_NAMES};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::super::super::Ctx;
use super::super::block::{collect_missing, decoration_spec_at};
use super::{Grid, SpanRun};

impl<'a, 'b> Ctx<'a, 'b> {
    /// A span's computed style: the *block's* computed style overlaid
    /// with the span's named styles then its inline style. Starting from
    /// the block computed (not `ComputedStyle::base`) both inherits the
    /// text properties and propagates the block's `textDecoration`, CSS
    /// style; the box/block-level fields also carry but are never read
    /// per span (validation flags them, `ignored_span_style`).
    fn span_style(&self, block: &ComputedStyle, names: &[String], inline: &Style) -> ComputedStyle {
        let mut computed = block.clone();
        for name in names.iter().take(MAX_STYLE_NAMES) {
            if let Some(style) = self.input.template.styles.get(name) {
                computed = computed.overlaid(style);
            }
        }
        computed.overlaid(inline)
    }

    /// Resolves each span's content, style, and font chain. Applies the
    /// layout-side `MAX_SPANS` guard (defense in depth — validation
    /// already warns) and the per-span sanity clamps, so hostile span
    /// values degrade exactly like block-level ones.
    pub(in crate::engine::text) fn resolve_spans(
        &mut self,
        text: &TextItem,
        computed: &ComputedStyle,
        block_link: Option<&str>,
    ) -> Vec<SpanRun<'a>> {
        if text.spans.len() > MAX_SPANS {
            self.diags.push(
                Diagnostic::new(Code::TooManySpans)
                    .arg("count", text.spans.len())
                    .arg("max", MAX_SPANS),
            );
        }
        let mut spans = Vec::with_capacity(text.spans.len().min(MAX_SPANS));
        for span in text.spans.iter().take(MAX_SPANS) {
            // A span with neither `text` nor `data` resolves to empty
            // content silently — validation already warns (`empty_span`).
            let content = self
                .resolve_content(span.text.as_deref(), span.data.as_ref(), &text.bindings)
                .unwrap_or_default();
            let sc = self.span_style(computed, &span.style_names, &span.style);
            let size = self.sane_font_size(sc.font_size);
            let letter_spacing = self.sane_letter_spacing(sc.letter_spacing);
            let chain = self.resolved_chain(&sc);
            // A span's own `link` overrides the block's for its runs; a
            // rejected span link stays dropped (no block fallback), so
            // the warning the author got is not silently masked.
            let link = match span.link.as_ref() {
                Some(_) => self.resolve_link(span.link.as_ref(), &text.bindings),
                None => block_link.map(str::to_string),
            };
            spans.push(SpanRun {
                content,
                font_id: chain.primary.face.id.clone(),
                size,
                letter_spacing,
                color: self.color_or_black(sc.color.as_deref()),
                synthetic_bold: sc.font_weight == FontWeight::Bold && !chain.primary.real_bold,
                synthetic_italic: sc.font_style == FontStyle::Italic && !chain.primary.real_italic,
                decoration_kind: sc.text_decoration,
                decoration: None,
                link,
                // tate-chu-yoko rides the span cascade (block value inherited,
                // span override honored) — active only on vertical blocks.
                combine: sc.text_combine_upright.active(),
                chain,
            });
        }
        spans
    }

    /// Missing glyphs with one shared budget across all spans, so a rich
    /// block echoes at most `MAX_MISSING_GLYPHS` distinct chars total —
    /// the span count must not multiply the diagnostic length.
    pub(in crate::engine::text) fn warn_span_glyphs(&mut self, spans: &[SpanRun<'a>]) {
        let mut missing = String::new();
        let mut truncated = false;
        for s in spans {
            truncated |= collect_missing(&s.content, &s.chain.faces, &mut missing);
        }
        if !missing.is_empty() {
            let ellipsis = if truncated { " …" } else { "" };
            self.diags.push(
                Diagnostic::new(Code::MissingGlyph)
                    .arg("font", "the span fonts")
                    .arg("chars", format!("{missing}{ellipsis}")),
            );
        }
    }

    /// Computes the uniform grid — one line height and one baseline for
    /// the whole block, from the *clamped* span sizes so hostile values
    /// cannot inflate it — and fills each span's decoration against the
    /// shared baseline. Spans with empty content don't participate (an
    /// unused huge span must not stretch the grid); an all-empty block
    /// falls back to the block style's own metrics.
    pub(in crate::engine::text) fn span_grid(
        &mut self,
        spans: &mut [SpanRun<'a>],
        computed: &ComputedStyle,
    ) -> Grid<'a> {
        let block_chain = self.resolved_chain(computed);
        let block_size = self.sane_font_size(computed.font_size);
        let lh_mult = self.sane_line_height(computed.line_height);
        let drawn = |s: &&SpanRun| !s.content.is_empty();
        let grid_size = spans
            .iter()
            .filter(drawn)
            .map(|s| s.size)
            .reduce(f64::max)
            .unwrap_or(block_size);
        let baseline = spans
            .iter()
            .filter(drawn)
            .map(|s| s.chain.primary.face.ascent(s.size))
            .reduce(f64::max)
            .unwrap_or_else(|| block_chain.primary.face.ascent(block_size));
        for s in spans.iter_mut() {
            s.decoration =
                decoration_spec_at(s.chain.primary.face, s.decoration_kind, s.size, baseline);
        }
        Grid {
            block_chain,
            block_size,
            line_height: grid_size * lh_mult,
            baseline,
        }
    }
}
