//! Text-block tree types: wrapped lines, rich runs, decoration; the
//! uniform run view both renderers draw through lives in [`view`].

mod view;
pub use view::RunView;

use serde::Serialize;
use shojiku_core::{TextCombine, TextOrientation, TextSpacingTrim};

/// Serde skip predicate: the trim default (no trimming) never serializes,
/// so pre-micro-typography trees round-trip byte-for-byte.
fn is_space_all(t: &TextSpacingTrim) -> bool {
    matches!(t, TextSpacingTrim::SpaceAll)
}

/// A block of wrapped text. Each line already has its own x (alignment is
/// resolved at layout time). The block-level font/color fields describe
/// the whole block for plain text; rich (span) lines carry per-run
/// overrides in [`TextLine::runs`] instead — renderers iterate
/// [`TextBlock::line_runs`] so both shapes draw through one path.
#[derive(Debug, Clone, Serialize)]
pub struct TextBlock {
    pub font_id: String,
    /// Fallback face ids after the primary: renderers rebuild the
    /// chain `[font_id, …fallback_ids]` and draw each glyph with the face
    /// its `face_index` points at. Empty = no fallback (the common case).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fallback_ids: Vec<String>,
    pub font_size: f64,
    /// Distance between line tops, in pt.
    pub line_height: f64,
    /// Extra advance after every character, in pt (already sanity-clamped
    /// by layout). Renderers pass it to `FontFace::positioned_glyphs` so
    /// drawing matches the width layout measured.
    pub letter_spacing: f64,
    pub color: (f32, f32, f32),
    /// Synthetic (faux) bold: no bold face variant exists, so renderers
    /// thicken the filled glyphs by stroking them with
    /// [`TextBlock::synthetic_bold_stroke_width`] in the text color.
    /// Advances are unchanged, matching CSS synthetic bold.
    pub synthetic_bold: bool,
    /// Synthetic (faux) italic: renderers skew each line rightward by
    /// [`TextBlock::SYNTHETIC_ITALIC_SKEW`] about its baseline.
    pub synthetic_italic: bool,
    /// Decoration line (`textDecoration`), fully resolved: renderers
    /// draw one filled rect per line at
    /// `(line.x, line.y + offset, line.width, thickness)` in the text
    /// color — no font knowledge needed. `None` = no decoration. On a
    /// vertical block ([`TextBlock::vertical`] `Some`) the spec reads
    /// axis-swapped — see [`DecorationSpec`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub decoration: Option<DecorationSpec>,
    /// Paint alpha `0..=1` (`opacity`), applied to glyphs and the
    /// decoration line alike. Already sanity-clamped by layout.
    pub opacity: f32,
    /// Baseline offset from each line's top, in pt. Set for rich
    /// (span) blocks, where mixed font sizes share one layout-computed
    /// baseline; `None` = the primary face's ascent at `font_size`
    /// (plain blocks, today's behavior) — see
    /// [`TextBlock::baseline_offset`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub baseline: Option<f64>,
    /// Hyperlink URL over every line of a *plain* block, already
    /// interpolated and scheme/length-gated by layout; the PDF backend
    /// emits one link annotation per line rect. Rich blocks keep this
    /// `None` — their links ride the runs ([`TextRun::link`]).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
    /// Fullwidth-punctuation trimming (half-width punctuation) for this block. Both plain
    /// and rich runs re-shape with it, and the first run of every line also
    /// gets the `trim_start` line-head trim. `SpaceAll` (the default) trims
    /// nothing, so it is skipped on serialization.
    #[serde(default, skip_serializing_if = "is_space_all")]
    pub text_spacing_trim: TextSpacingTrim,
    /// Vertical writing: `Some(orientation)` makes each
    /// [`TextLine`] a column (top-to-bottom, laid right-to-left) that the
    /// renderers draw via `font::arrange_vertical` instead of the
    /// horizontal `line_runs` path; `None` (skipped on serialization) is
    /// ordinary horizontal text, so pre-vertical trees round-trip
    /// byte-for-byte. For a vertical line, `x`/`y` are the column box's
    /// top-left and `width` is the column's measured extent DOWN the page
    /// (link annotations use it as the rect height); the cross-axis column
    /// width is [`TextBlock::line_height`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vertical: Option<TextOrientation>,
    /// tate-chu-yoko combining on a vertical block: `digits N` makes runs of up
    /// to N consecutive ASCII digits share one upright cell, `all` the
    /// block's whole content. Renderers pass it into the vertical
    /// arrangement so drawing matches how layout measured the columns.
    /// `None` (skipped on serialization) combines nothing; meaningless
    /// when [`TextBlock::vertical`] is `None`. Rich runs carry their own
    /// [`TextRun::combine`] instead.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_combine: Option<TextCombine>,
    pub lines: Vec<TextLine>,
}

/// A resolved decoration line: where to draw it relative to each line,
/// and how thick. Computed by layout from the face's font tables at
/// the final (post-shrink) font size. CONTRACT — the fields read per the
/// block's axis: on a horizontal block the band is
/// `(line.x, line.y + offset, line.width, thickness)`; on a VERTICAL
/// block ([`TextBlock::vertical`] `Some`) it is a SIDE band
/// `(line.x + offset, line.y, thickness, line.width)` — `offset` is then
/// the x distance from the column left ([`TextLine::x`]) to the band's
/// LEFT edge (underline sits right of the em cell — JLREQ side-line;
/// line-through on the column axis), and per-run rich bands start at
/// `line.y + run.x` with height `run.width`.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct DecorationSpec {
    /// Offset from the line's top (`TextLine::y`) to the decoration's top
    /// (horizontal), or from the column's left (`TextLine::x`) to the
    /// band's left edge (vertical), in pt.
    pub offset: f64,
    /// Line thickness in pt (> 0).
    pub thickness: f64,
}

impl TextBlock {
    /// Skew factor (tangent of the slant angle, ~12°) both renderers use
    /// for synthetic italic. Lives on the tree contract so PDF and PNG
    /// output cannot drift.
    pub const SYNTHETIC_ITALIC_SKEW: f64 = 0.212_56;

    /// Stroke width in pt both renderers use for synthetic bold: thick
    /// enough to read as bold at body sizes without closing glyph
    /// counters. Rich runs scale the same factor by their own size.
    pub fn synthetic_bold_stroke_width(&self) -> f64 {
        self.font_size * 0.03
    }

    /// Baseline offset from a line's top: the layout-computed rich
    /// baseline when present, else `primary_ascent` (the primary face's
    /// ascent at `font_size`, which the caller looks up — plain blocks).
    pub fn baseline_offset(&self, primary_ascent: f64) -> f64 {
        self.baseline.unwrap_or(primary_ascent)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct TextLine {
    pub text: String,
    /// Left edge of this line, page coords.
    pub x: f64,
    /// Top of this line's box, page coords.
    pub y: f64,
    /// Measured width of this line in pt (the same measurement alignment
    /// used). Lets renderers size per-line decoration without measuring.
    pub width: f64,
    /// Styled runs (rich spans), left to right; empty = the whole
    /// line is one implicit run in the block's style (plain text, the
    /// common case — the wire stays exactly as before).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub runs: Vec<TextRun>,
}

/// One styled run within a rich line: a span fragment with its resolved
/// font, color, and decoration. For a horizontal block `x` is absolute page
/// coords like [`TextLine::x`] and the run sits on the block's shared
/// [`TextBlock::baseline`]; for a vertical block ([`TextBlock::vertical`] is
/// `Some`) the axes swap — `x` is the run's down-offset from the column top
/// ([`TextLine::y`]) and `width` its extent DOWN the column, while the
/// cross-axis column left is [`TextLine::x`] and its width
/// [`TextBlock::line_height`].
#[derive(Debug, Clone, Serialize)]
pub struct TextRun {
    pub text: String,
    /// Index of the authoring `spans[]` entry this run came from, so a
    /// GUI can map a canvas hit back to the span being edited.
    pub span: usize,
    /// Left edge of this run in page coords (horizontal), or the run's
    /// down-offset from the column top (vertical — see the struct doc).
    pub x: f64,
    /// Measured width of this run in pt (horizontal), or its down-extent
    /// along the column (vertical).
    pub width: f64,
    pub font_id: String,
    /// Fallback face ids after the primary, like the block's.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fallback_ids: Vec<String>,
    pub font_size: f64,
    pub letter_spacing: f64,
    pub color: (f32, f32, f32),
    pub synthetic_bold: bool,
    pub synthetic_italic: bool,
    /// Decoration line for this run, offset from the *line's* top like
    /// the block-level [`TextBlock::decoration`] (layout already folded
    /// the shared baseline in).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub decoration: Option<DecorationSpec>,
    /// Hyperlink URL for this run: the span's own `link`, else the
    /// block's, resolved and gated by layout. The PDF backend emits one
    /// link annotation per run rect.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
    /// tate-chu-yoko for this run's span (`digits N` / `all`), resolved through
    /// the span cascade. The vertical draw path passes it into the
    /// arrangement so a combined cell draws exactly as measured; `None`
    /// (skipped on serialization) combines nothing, so pre-existing rich
    /// trees round-trip. Horizontal runs ignore it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub combine: Option<TextCombine>,
}
