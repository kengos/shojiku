//! Line positioning for rich blocks: alignment from summed run widths,
//! then runs laid left to right on the block's shared baseline grid.

use crate::font::{run_width, RunOptions};
use crate::style::ComputedStyle;
use crate::tree::{TextLine, TextRun};
use crate::wrap::RichPiece;

use super::SpanRun;

/// Positions one wrapped line: measures each piece with its own span's
/// chain/size/spacing, aligns the whole line, and emits the styled runs
/// (each carrying its authoring span index for GUI hit-testing).
pub(super) fn rich_line(
    spans: &[SpanRun<'_>],
    pieces: Vec<RichPiece>,
    computed: &ComputedStyle,
    content_x: f64,
    content_w: f64,
    y: f64,
) -> TextLine {
    // Each piece re-shapes with the block's trim; only the line's first
    // piece is a line start (the `trim_start` line-head trim). The drawing
    // side derives the same flag ONCE, in `TextBlock::line_runs`
    // (`RunView.line_start`) — keep the two derivations aligned.
    let widths: Vec<f64> = pieces
        .iter()
        .enumerate()
        .map(|(i, p)| {
            let s = &spans[p.span];
            run_width(
                &s.chain.faces,
                &p.text,
                s.size,
                RunOptions {
                    letter_spacing: s.letter_spacing,
                    trim: computed.text_spacing_trim,
                    line_start: i == 0,
                    combine: None,
                },
            )
        })
        .collect();
    let line_w: f64 = widths.iter().sum();
    let lx = super::super::align_x(computed.text_align, content_x, content_w, line_w);
    let mut cursor = lx;
    let mut joined = String::new();
    let mut runs = Vec::with_capacity(pieces.len());
    for (piece, &pw) in pieces.iter().zip(&widths) {
        let s = &spans[piece.span];
        runs.push(TextRun {
            text: piece.text.clone(),
            span: piece.span,
            x: cursor,
            width: pw,
            font_id: s.font_id.clone(),
            fallback_ids: s.chain.fallback_ids.clone(),
            font_size: s.size,
            letter_spacing: s.letter_spacing,
            color: s.color,
            synthetic_bold: s.synthetic_bold,
            synthetic_italic: s.synthetic_italic,
            decoration: s.decoration,
            link: s.link.clone(),
            // Horizontal runs never combine (tate-chu-yoko is a vertical-only
            // effect); the field still records nothing here.
            combine: None,
        });
        cursor += pw;
        joined.push_str(&piece.text);
    }
    TextLine {
        text: joined,
        x: lx,
        y,
        width: line_w,
        runs,
    }
}
