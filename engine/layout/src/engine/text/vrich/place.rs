//! Vertical rich column positioning: one wrapped column's pieces into
//! stacked [`TextRun`]s with the shaped extent / hung-exclusion bases.
//! Split from the block builder ([`super`]) for the line budget.

use shojiku_core::{TextOrientation, TextSpacingTrim};

use super::super::rich::SpanRun;
use super::super::vcol::vertical_decoration_spec;
use crate::font::{down_advance_over, RunOptions};
use crate::tree::TextRun;
use crate::wrap::WrappedLine;

/// One positioned vertical rich column: its runs, inked down-extent, and
/// the hung-exclusion alignment basis (one unit — never parallel vectors).
pub(super) struct PlacedCol {
    pub runs: Vec<TextRun>,
    pub extent: f64,
    pub align_extent: f64,
}

/// Positions one wrapped column's pieces into [`TextRun`]s, stacking each
/// run below the previous: `x` is the run's down-offset from the column
/// top, `width` its measured down-extent (the same shaped basis the
/// renderers draw, trimming included — the first run of a column carries
/// the `trim_start` column head). A hung trailing comma is kept in the
/// inked extent but excluded from the alignment basis, mirroring the
/// horizontal rule; per-run `textDecoration` becomes a side band
/// ([`vertical_decoration_spec`]).
pub(super) fn place_col(
    spans: &[SpanRun<'_>],
    col: &WrappedLine,
    orient: TextOrientation,
    trim: TextSpacingTrim,
    col_width: f64,
) -> PlacedCol {
    let mut down = 0.0;
    let mut runs = Vec::with_capacity(col.pieces.len());
    for (i, p) in col.pieces.iter().enumerate() {
        let s = &spans[p.span];
        let opts = RunOptions {
            letter_spacing: s.letter_spacing,
            trim,
            line_start: i == 0,
            combine: s.combine,
        };
        let extent =
            super::super::vcol::column_extent(&s.chain.faces, &p.text, s.size, orient, opts);
        runs.push(TextRun {
            text: p.text.clone(),
            span: p.span,
            x: down,
            width: extent,
            font_id: s.font_id.clone(),
            fallback_ids: s.chain.fallback_ids.clone(),
            font_size: s.size,
            letter_spacing: s.letter_spacing,
            color: s.color,
            synthetic_bold: s.synthetic_bold,
            synthetic_italic: false,
            decoration: vertical_decoration_spec(
                s.chain.primary.face,
                s.decoration_kind,
                s.size,
                col_width,
            ),
            link: s.link.clone(),
            combine: s.combine,
        });
        down += extent;
    }
    let extent = down;
    let hung_adv = if col.hung {
        col.pieces.last().map_or(0.0, |p| {
            let s = &spans[p.span];
            p.text.chars().next_back().map_or(0.0, |c| {
                down_advance_over(&s.chain.faces, c, s.size, orient) + s.letter_spacing
            })
        })
    } else {
        0.0
    };
    PlacedCol {
        runs,
        extent,
        align_extent: (extent - hung_adv).max(0.0),
    }
}
