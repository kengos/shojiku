//! Wrapped + aligned text-block building: border-box padding, vertical
//! alignment, the box decoration (via `super::super::decoration`), and
//! (via [`glyphs`]) the missing-glyph diagnostic.

mod glyphs;
mod lines;
pub(in crate::engine) use glyphs::collect_missing;
use lines::wrap_plain;

use crate::style::ComputedStyle;
use crate::tree::{DecorationSpec, LayoutItem, TextBlock};
use crate::wrap::WrappedLine;
use shojiku_core::{FontStyle, FontWeight, TextDecoration, TextOverflow};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::super::{Atom, Ctx};
use super::height::{block_height, content_avail};
use super::overflow::{clamp_with_ellipsis, fit_font_size};

impl<'a, 'b> Ctx<'a, 'b> {
    /// Builds a wrapped, aligned text block from an already-resolved style.
    /// `x`/`w` are the border box; `padding` (`[t, r, b, l]`, already
    /// resolved) insets the content without growing the box, and the
    /// `backgroundColor` fill covers the full border box. Lines carry
    /// absolute x and y relative to the block top; the sanity clamps still
    /// apply since a resolved size/height can be hostile.
    #[allow(clippy::too_many_arguments)] // border box + padding + D3 height bounds
    pub(in crate::engine) fn text_block(
        &mut self,
        content: &str,
        computed: &ComputedStyle,
        x: f64,
        w: f64,
        box_h: Option<f64>,
        padding: [f64; 4],
        h_bounds: (Option<f64>, Option<f64>),
    ) -> Atom {
        let resolved = self.resolved_chain(computed);
        let font_id = resolved.primary.face.id.clone();
        self.warn_missing_glyphs(content, &resolved.faces, &font_id);
        let mut size = self.sane_font_size(computed.font_size);
        let lh_mult = self.sane_line_height(computed.line_height);
        let mut line_height = size * lh_mult;
        let letter_spacing = self.sane_letter_spacing(computed.letter_spacing);
        // Content box: the border box minus padding, clamped since padding
        // may exceed the authored box.
        let content_x = x + padding[3];
        let content_w = (w - padding[3] - padding[1]).max(0.0);
        // The wrapped lines travel as whole `WrappedLine`s (text + hung
        // flag together) through every overflow policy below — never
        // split into parallel vectors an edit could desynchronize.
        let mut wrapped = wrap_plain(
            computed,
            &resolved.faces,
            content,
            size,
            content_w,
            letter_spacing,
        );
        let mut content_h = wrapped.len() as f64 * line_height;

        // T1 overflow policies act only on a definite height with actual
        // overflow — auto-height boxes grow to fit (Thinreports `expand`),
        // and `visible` keeps today's warn-and-grow behavior (the warning
        // below still fires when content overflows after the policy).
        let avail = box_h.map(|h| content_avail(h, padding));
        let mut clip = false;
        if let Some(avail) = avail {
            if content_h > avail + 0.01 {
                match computed.text_overflow {
                    TextOverflow::Visible => {}
                    // D2: keep every line; the block reserves exactly the
                    // authored height and the renderers cut at its edge
                    // (a partially visible line is clipped, not clamped).
                    TextOverflow::Clip => clip = true,
                    // Shrink probes and the ellipsis clamp measure
                    // untrimmed on purpose — the safe-upper-bound rule
                    // lives on `super::overflow`'s module header.
                    TextOverflow::Shrink => {
                        size = fit_font_size(
                            &resolved.faces,
                            content,
                            size,
                            lh_mult,
                            content_w,
                            avail,
                            computed.line_break,
                            letter_spacing,
                        );
                        line_height = size * lh_mult;
                        wrapped = wrap_plain(
                            computed,
                            &resolved.faces,
                            content,
                            size,
                            content_w,
                            letter_spacing,
                        );
                        content_h = wrapped.len() as f64 * line_height;
                    }
                    TextOverflow::Ellipsis => {
                        // `line_height > 0` (both factors sanity-guarded),
                        // and `avail` is capped by MAX_RESOLVED_PT, so the
                        // cast is finite and bounded.
                        let max_lines = (avail / line_height).floor() as usize;
                        if max_lines == 0 {
                            self.diags.push(
                                Diagnostic::new(Code::TextOverflow)
                                    .arg("content", line_height)
                                    .arg("avail", avail),
                            );
                        }
                        let texts = wrapped.iter().map(WrappedLine::text).collect();
                        let clamped = clamp_with_ellipsis(
                            &resolved.faces,
                            texts,
                            size,
                            letter_spacing,
                            content_w,
                            max_lines,
                        );
                        // Clamped lines re-enter as plain non-hung lines
                        // (the `…` is the tail now, not a hung comma).
                        wrapped = clamped.into_iter().map(WrappedLine::plain).collect();
                        content_h = wrapped.len() as f64 * line_height;
                    }
                }
            }
        }
        let padded_h = content_h + padding[0] + padding[2];
        let block_h = block_height(box_h, clip, padded_h, h_bounds);
        self.warn_block_overflow(avail, content_h, clip);
        // Vertical alignment distributes the slack inside the content box
        // (block minus padding); `block_h >= padded_h` keeps it >= 0.
        let avail_h = block_h - padding[0] - padding[2];
        let offset = super::valign_offset(computed.vertical_align, padding[0], avail_h, content_h);

        let positioned = lines::positioned_lines(
            wrapped,
            &lines::LineLayout {
                faces: &resolved.faces,
                computed,
                content_x,
                content_w,
                offset,
                line_height,
                size,
                letter_spacing,
            },
        );

        // F2 decoration: resolved here — at the FINAL (post-shrink) size,
        // from the primary face's own tables — so renderers just draw a
        // rect per line.
        let decoration = decoration_spec(resolved.primary.face, computed.text_decoration, size);

        let block = LayoutItem::Text(TextBlock {
            font_id,
            fallback_ids: resolved.fallback_ids,
            font_size: size,
            line_height,
            letter_spacing,
            color: self.color_or_black(computed.color.as_deref()),
            // Synthetic variants: fall back to faux emboldening /
            // skew only when the resolved face is not already a real bold /
            // italic variant of the family.
            synthetic_bold: computed.font_weight == FontWeight::Bold && !resolved.primary.real_bold,
            synthetic_italic: computed.font_style == FontStyle::Italic
                && !resolved.primary.real_italic,
            decoration,
            opacity: self.sane_opacity(computed.opacity),
            baseline: None,
            // Filled by `text_atom` (the item owns `link:`); cell/band
            // callers have no link wire.
            link: None,
            text_spacing_trim: computed.text_spacing_trim,
            // Horizontal block; the vertical builder lives in `vblock`.
            vertical: None,
            text_combine: None,
            lines: positioned,
        });
        // The box around the finished block, and the split chrome the
        // paginator replays per fragment (`super::chrome`): the slack
        // `verticalAlign` put above the content is `offset` minus the top
        // padding, the rest of the reserved height sits below it.
        let slack_top = offset - padding[0];
        let items = self.assemble_block(
            block,
            computed,
            super::BlockGeom {
                x,
                w,
                h: block_h,
                clip,
            },
            (slack_top, (block_h - padded_h - slack_top).max(0.0)),
        );

        Atom {
            height: block_h,
            items,
            // Ids are recorded by the callers that know them (text_atom /
            // page_number); table cells have no ids. The resolved box is
            // attached by callers that have one (text_atom).
            boxes: Vec::new(),
            rb: None,
        }
    }
}

/// Resolves a `textDecoration` into the tree's [`DecorationSpec`] at the
/// final font size. Metric offsets are baseline-relative y-up; the tree
/// wants "from the line top, y-down", and the baseline sits `ascent`
/// below the line top in both renderers. Shared by text blocks and lists.
pub(in crate::engine) fn decoration_spec(
    face: &crate::font::FontFace,
    kind: TextDecoration,
    size: f64,
) -> Option<DecorationSpec> {
    decoration_spec_at(face, kind, size, face.ascent(size))
}

/// [`decoration_spec`] against an explicit baseline offset: rich blocks
/// (RT1) share one layout-computed baseline across mixed-size runs, so
/// each run's decoration hangs off that baseline, not its own ascent.
pub(super) fn decoration_spec_at(
    face: &crate::font::FontFace,
    kind: TextDecoration,
    size: f64,
    baseline: f64,
) -> Option<DecorationSpec> {
    let (off, thickness) = match kind {
        TextDecoration::None => return None,
        TextDecoration::Underline => face.underline_metrics(size),
        TextDecoration::LineThrough => face.strikeout_metrics(size),
    };
    Some(DecorationSpec {
        offset: baseline - off,
        thickness,
    })
}
