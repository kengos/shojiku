//! The uniform run view ([`RunView`]) both renderers draw through, and
//! its builder [`TextBlock::line_runs`] — split from the tree types
//! ([`super`]) for the line budget.

use crate::font::RunOptions;
use shojiku_core::TextSpacingTrim;

use super::{DecorationSpec, TextBlock, TextLine};

impl TextBlock {
    /// The drawable runs of one line — the single home both renderers
    /// iterate so PDF and PNG cannot drift: a rich line yields its
    /// explicit runs; a plain line yields one implicit run built from the
    /// block-level fields.
    pub fn line_runs<'a>(&'a self, line: &'a TextLine) -> Vec<RunView<'a>> {
        if line.runs.is_empty() {
            return vec![RunView {
                text: &line.text,
                span: None,
                x: line.x,
                width: line.width,
                font_id: &self.font_id,
                fallback_ids: &self.fallback_ids,
                font_size: self.font_size,
                letter_spacing: self.letter_spacing,
                trim: self.text_spacing_trim,
                line_start: true,
                color: self.color,
                synthetic_bold: self.synthetic_bold,
                synthetic_italic: self.synthetic_italic,
                decoration: self.decoration,
                link: self.link.as_deref(),
            }];
        }
        line.runs
            .iter()
            .enumerate()
            .map(|(i, r)| RunView {
                text: &r.text,
                span: Some(r.span),
                x: r.x,
                width: r.width,
                font_id: &r.font_id,
                fallback_ids: &r.fallback_ids,
                font_size: r.font_size,
                letter_spacing: r.letter_spacing,
                trim: self.text_spacing_trim,
                line_start: i == 0,
                color: r.color,
                synthetic_bold: r.synthetic_bold,
                synthetic_italic: r.synthetic_italic,
                decoration: r.decoration,
                link: r.link.as_deref(),
            })
            .collect()
    }
}

/// A borrowed, uniform view of one drawable run (see
/// [`TextBlock::line_runs`]). Not serialized — the wire forms are the
/// block-level fields (plain) and [`super::TextRun`] (rich).
pub struct RunView<'a> {
    pub text: &'a str,
    /// Authoring `spans[]` index for rich runs; `None` for the implicit
    /// plain-text run.
    pub span: Option<usize>,
    pub x: f64,
    pub width: f64,
    pub font_id: &'a str,
    pub fallback_ids: &'a [String],
    pub font_size: f64,
    pub letter_spacing: f64,
    /// Fullwidth-punctuation trimming for this run (always the block's
    /// value — a span cannot override it). Renderers pass it to `shape_run`
    /// so drawing reproduces the advances layout measured.
    pub trim: TextSpacingTrim,
    /// Whether this run begins its line (the `trim_start` line-head trim
    /// applies to it). Derived ONCE, in [`TextBlock::line_runs`] — a plain
    /// line's implicit run always starts it; a rich line's first run does.
    /// Renderers must consume [`RunView::options`] instead of re-deriving
    /// this, so drawing cannot drift from how layout measured.
    pub line_start: bool,
    pub color: (f32, f32, f32),
    pub synthetic_bold: bool,
    pub synthetic_italic: bool,
    pub decoration: Option<DecorationSpec>,
    /// Hyperlink URL for this run: the block's for the implicit plain
    /// run, the run's own for rich runs.
    pub link: Option<&'a str>,
}

impl RunView<'_> {
    /// Synthetic-bold stroke width for this run: the block-level factor
    /// (see [`TextBlock::synthetic_bold_stroke_width`]) scaled by the
    /// run's own size, so a small span is not over-inked.
    pub fn synthetic_bold_stroke_width(&self) -> f64 {
        self.font_size * 0.03
    }

    /// The shaping options this run was measured with — the ONE way a
    /// renderer builds its `shape_run` arguments (reserved == drawn).
    pub fn options(&self) -> RunOptions {
        RunOptions {
            letter_spacing: self.letter_spacing,
            trim: self.trim,
            line_start: self.line_start,
            // Horizontal runs never combine; the vertical draw path builds
            // its own options from the block's/run's combine (tate-chu-yoko).
            combine: None,
        }
    }
}
