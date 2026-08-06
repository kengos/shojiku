//! Text content and atoms: binding/interpolation resolution and the
//! text-item atom (margins + padding); block building lives in
//! [`block`] (plain) and [`rich`] (spans).

mod block;
mod chrome;
mod height;
mod mark;
mod metrics;
mod overflow;
mod paginate;
mod resolve;
mod rich;
mod ruby;
#[cfg(test)]
mod tests;
mod vblock;
mod vcol;
mod voverflow;
mod vrich;

pub(in crate::engine) use block::collect_missing;
pub(super) use block::decoration_spec;
pub(in crate::engine) use chrome::{BlockGeom, SplitChrome};
pub(super) use overflow::clamp_line;
pub(in crate::engine) use vcol::{
    along_offset, clamp_column_down, column_extent, column_left, vertical_decoration_spec,
};

use crate::style::ComputedStyle;
use crate::tree::LayoutItem;
use shojiku_core::{TextAlign, TextItem, VerticalAlign};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::{placed_box, with_vertical_margin, Atom, Basis, Ctx};

/// Attaches a resolved link to the text block the builder just produced,
/// reaching through a `textOverflow: clip` wrapper. Runs on the atom's
/// own items only (a decoration rect stays linkless — the block's line
/// rects are the activation area).
fn set_block_link(items: &mut [LayoutItem], link: &str) {
    for item in items {
        match item {
            LayoutItem::Text(block) => block.link = Some(link.to_string()),
            LayoutItem::Clip(clip) => set_block_link(&mut clip.items, link),
            _ => {}
        }
    }
}

/// The first text block in a walk over `items`, reaching through a
/// `textOverflow: clip` wrapper (`Clip`) — the block may be nested there.
/// Shared by the `mark:` overlay and the inspect text-metrics builder.
fn find_text_block(items: &[LayoutItem]) -> Option<&crate::tree::TextBlock> {
    for item in items {
        match item {
            LayoutItem::Text(block) => return Some(block),
            LayoutItem::Clip(clip) => {
                if let Some(block) = find_text_block(&clip.items) {
                    return Some(block);
                }
            }
            _ => {}
        }
    }
    None
}

/// Aligned left edge for a measured line within the content box (shared
/// by the plain and rich block builders).
fn align_x(align: TextAlign, content_x: f64, content_w: f64, line_w: f64) -> f64 {
    match align {
        TextAlign::Left => content_x,
        TextAlign::Center => content_x + ((content_w - line_w) / 2.0).max(0.0),
        TextAlign::Right => content_x + (content_w - line_w).max(0.0),
    }
}

/// Vertical-alignment offset of the content inside the padded block:
/// distributes the slack of the content box (`avail_h - content_h`)
/// below the top padding. `avail_h >= content_h` except under `clip`,
/// where the max(0) keeps the offset at the padding.
fn valign_offset(valign: VerticalAlign, padding_top: f64, avail_h: f64, content_h: f64) -> f64 {
    padding_top
        + match valign {
            VerticalAlign::Top => 0.0,
            VerticalAlign::Middle => ((avail_h - content_h) / 2.0).max(0.0),
            VerticalAlign::Bottom => (avail_h - content_h).max(0.0),
        }
}

impl<'a, 'b> Ctx<'a, 'b> {
    /// Builds a text item's atom: border box from the resolved box,
    /// padding passed through to the block builder, margins wrapped
    /// around the reserved height. Rich items (`spans`) route to
    /// the span builder, which produces the same atom shape. A `mark:`
    /// (text-anchored circled-text) overlays a glyph-band oval last, so it draws
    /// over the finished block in either path.
    pub(super) fn text_atom(&mut self, text: &TextItem, basis: &Basis) -> Atom {
        let computed = self.resolve_style(&text.style_names, &text.style);
        let vertical = computed.writing_mode == shojiku_core::WritingMode::VerticalRl;
        let mut atom = if text.spans.is_empty() {
            self.plain_text_atom(text, basis, &computed)
        } else if vertical {
            // Rich spans honor a vertical writing mode: each column carries
            // per-span runs (the spans counterpart of the plain vertical
            // block).
            self.vertical_rich_atom(text, basis, &computed)
        } else {
            self.rich_text_atom(text, basis)
        };
        if let Some(mark) = &text.mark {
            // The circled-text overlay is a horizontal glyph-band oval; skip it on
            // a vertical block rather than paint it in the wrong axis.
            if vertical {
                self.warn_vertical_unsupported("mark:");
            } else {
                self.apply_text_mark(&mut atom, mark, &computed);
            }
        }
        // Ruby readings ride every finished text surface (post-policy, so
        // bases match the drawn text; after link/mark so readings stay
        // linkless and above the overlays).
        if !text.ruby.is_empty() {
            if vertical {
                self.apply_vertical_ruby(&mut atom, text, &computed, basis);
            } else {
                self.apply_horizontal_ruby(&mut atom, text, &computed, basis);
            }
        }
        atom
    }

    /// Reports a feature that does not support vertical writing in v1
    /// (`vertical_text_unsupported`), so a `writingMode: vertical_rl` that
    /// reaches it via the cascade is visible rather than silently
    /// horizontal. The named feature is the typed diagnostic argument.
    pub(super) fn warn_vertical_unsupported(&mut self, feature: &str) {
        self.diags
            .push(Diagnostic::new(Code::VerticalTextUnsupported).arg("feature", feature));
    }

    /// The plain (non-`spans`) text atom: resolve, wrap, link, box index,
    /// margins. Split from [`Self::text_atom`] so a `mark:` overlay runs
    /// once for both the plain and rich paths.
    fn plain_text_atom(
        &mut self,
        text: &TextItem,
        basis: &Basis,
        computed: &ComputedStyle,
    ) -> Atom {
        let b = text.box_.clone().unwrap_or_default();
        let rb = self.resolve_box(&b, basis);
        let w = rb.w_or_fill(basis, 1.0);
        let content = self
            .resolve_content(text.text.as_deref(), text.data.as_ref(), &text.bindings)
            .unwrap_or_else(|| {
                self.diags.push(Diagnostic::new(Code::EmptyTextItem));
                String::new()
            });
        let vertical = computed.writing_mode == shojiku_core::WritingMode::VerticalRl;
        let mut atom = if vertical {
            self.vertical_text_block(
                &content,
                computed,
                rb.x,
                w,
                rb.h_or_fill(basis),
                basis.h.unwrap_or(0.0),
                rb.padding,
            )
        } else {
            self.text_block(
                &content,
                computed,
                rb.x,
                w,
                rb.h_or_fill(basis),
                rb.padding,
                rb.h_bounds(),
            )
        };
        if let Some(link) = self.resolve_link(text.link.as_ref(), &text.bindings) {
            set_block_link(&mut atom.items, &link);
        }
        atom.rb = Some(rb);
        // The border box is the reserved block (it can exceed an authored
        // `h` when content overflows, like the drawn output).
        let path = self.current_path();
        let mut pb = placed_box(&path, text.id.as_deref(), &rb, w, atom.height);
        // Per-line metrics for horizontal blocks, per-column metrics for
        // vertical ones (the builder routes on the block's own axis).
        pb.text = self.text_metrics(&atom.items, computed);
        atom.boxes.push(pb);
        with_vertical_margin(atom, rb.margin[0], rb.margin[2])
    }
}
