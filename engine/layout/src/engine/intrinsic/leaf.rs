//! Per-kind max-content width: the text leaf and the container
//! recursion. Every function here runs under the measure park its caller
//! (`Ctx::max_content_width`) opened, and none of them place anything.

use shojiku_core::{ContainerItem, FlexDirection, TextItem, WritingMode};
use shojiku_layout_box::resolve_edges;

use crate::font::{run_width, RunOptions};

use super::super::flex::FlexKind;
use super::super::{Basis, Ctx};
use super::clamp_measured;

impl<'a, 'b> Ctx<'a, 'b> {
    /// A text block's max-content width: the widest AUTHORED line
    /// (wrapping is what a narrower box would add, and max-content is by
    /// definition the width at which none is needed).
    ///
    /// A vertical-writing block has no width-intrinsic size: its inline
    /// axis runs DOWN, so its horizontal extent is (column count ×
    /// column width) and therefore a function of the available HEIGHT.
    /// Measuring it here would report one column's width, which is wrong
    /// for every block that wraps to two.
    pub(super) fn text_max_content(&mut self, text: &TextItem) -> Option<f64> {
        let computed = self.resolve_style(&text.style_names, &text.style);
        if computed.writing_mode == WritingMode::VerticalRl {
            return None;
        }
        // Rich `spans` carry a per-span style chain each, so their width
        // needs the styled-char engine rather than one shaped run.
        if !text.spans.is_empty() {
            return None;
        }
        let content =
            self.resolve_content(text.text.as_deref(), text.data.as_ref(), &text.bindings)?;
        let size = self.sane_font_size(computed.font_size);
        let spacing = self.sane_letter_spacing(computed.letter_spacing);
        let chain = self.resolved_chain(&computed);
        let opts = RunOptions {
            letter_spacing: spacing,
            trim: computed.text_spacing_trim,
            line_start: true,
            combine: None,
        };
        let widest = content
            .split('\n')
            .map(|line| run_width(&chain.faces, line, size, opts))
            .fold(0.0_f64, |acc, w| acc.max(clamp_measured(w)));
        Some(widest + self.padding_x(text.box_.as_ref()))
    }

    /// A container's max-content width follows its own layout mode:
    /// a `row` needs every child side by side (Σ widths + gaps), a
    /// `column` needs its widest child. A `grid` container returns
    /// `None` — its tracks resolve against a width that is exactly what
    /// this measurement is trying to produce.
    pub(super) fn container_max_content(
        &mut self,
        container: &ContainerItem,
        basis: &Basis,
        depth: usize,
    ) -> Option<f64> {
        let b = container.box_.clone().unwrap_or_default();
        if b.type_ == Some(shojiku_core::BoxType::Grid) {
            return None;
        }
        let row = b.direction.unwrap_or_default() == FlexDirection::Row;
        let gap = self.resolve_x(b.gap, basis).unwrap_or(0.0).max(0.0);
        let mut total = 0.0_f64;
        let mut widest = 0.0_f64;
        let mut counted = 0usize;
        for child in &container.items {
            let Some(kind) = FlexKind::of(child) else {
                continue;
            };
            let child_box = kind.box_();
            // An authored `w` IS the child's width; only an unsized child
            // needs measuring.
            let child_w = match self.resolve_x(child_box.w, basis) {
                Some(w) => Some(w),
                None => self.measure_kind(&kind, basis, depth + 1),
            };
            let Some(w) = child_w else { continue };
            let m = resolve_edges(child_box.margin.as_ref(), basis, &mut self.diags);
            let outer = clamp_measured(w + m[1] + m[3]);
            total = clamp_measured(total + outer);
            widest = widest.max(outer);
            counted += 1;
        }
        if counted == 0 {
            return None;
        }
        let inner = if row {
            clamp_measured(total + gap * counted.saturating_sub(1) as f64)
        } else {
            widest
        };
        Some(clamp_measured(
            inner + self.padding_x(container.box_.as_ref()),
        ))
    }

    /// Horizontal padding of an authored box, in pt — the difference
    /// between a content width and the border-box width every caller of
    /// this module works in.
    fn padding_x(&mut self, b: Option<&shojiku_core::OptBox>) -> f64 {
        let Some(b) = b else { return 0.0 };
        let basis = Basis {
            x: 0.0,
            w: 0.0,
            h: None,
            font: self.font_rel(),
            pct_w: None,
            fill_h: None,
        };
        let p = resolve_edges(b.padding.as_ref(), &basis, &mut self.diags);
        (p[1] + p[3]).max(0.0)
    }
}
