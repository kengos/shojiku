//! The styled-char wrapping engine: tokenizing, greedy line
//! assembly, and kinsoku over `(char, span)` pairs, so rich spans and
//! plain text (a one-span input) break identically. Tokens are built over
//! the *joined* text — a Latin word crossing a span boundary still wraps
//! as one word, and kinsoku moves characters across span edges.

mod token;
mod width;
use token::{tokenize, Token};
use width::{token_width, width_of};

use super::hang::{apply_hang, hangable};
use super::{no_line_end, no_line_start};
use crate::font::FontFace;
use shojiku_core::{HangingPunctuation, LineBreak, TextCombine, TextOrientation};

/// One styled input fragment: resolved text plus its measurement inputs
/// (the span's face chain, clamped size, and letter spacing).
pub struct RichSpan<'a> {
    pub text: &'a str,
    pub faces: &'a [&'a FontFace],
    pub size: f64,
    pub letter_spacing: f64,
    /// Vertical orientation, or `None` for horizontal. When set,
    /// a char is measured by its down-advance instead of its horizontal
    /// advance, so the same greedy/kinsoku/hang machinery breaks columns
    /// against the region *height*. Plain vertical text only in v1.
    pub orient: Option<TextOrientation>,
    /// tate-chu-yoko: `digits N` makes runs of up to N consecutive ASCII digits
    /// within this span measure as ONE cell (the span's `size`), and
    /// `all` the span's WHOLE content, matching the combined arrangement.
    /// `None` (and every horizontal span) measures per char.
    pub combine: Option<TextCombine>,
}

/// One fragment of a wrapped line: the input-span index it came from and
/// the characters that landed on this line. Consecutive same-span chars
/// merge into one piece; an empty line has no pieces.
#[derive(Debug, PartialEq, Eq)]
pub struct RichPiece {
    pub span: usize,
    pub text: String,
}

/// A char tagged with the input span it came from.
type Styled = (char, usize);

/// A wrapped line plus whether its trailing punctuation hangs (hanging punctuation):
/// a `hung` line's last character is excluded from alignment width so it
/// sits in the end margin. Always `false` unless hanging is active.
#[derive(Debug, PartialEq, Eq)]
pub struct WrappedLine {
    pub pieces: Vec<RichPiece>,
    pub hung: bool,
}

impl WrappedLine {
    /// The line's text, concatenating its pieces (a single span for the
    /// plain wrapper, several for rich input).
    pub fn text(&self) -> String {
        self.pieces.iter().map(|p| p.text.as_str()).collect()
    }

    /// A plain single-span line that does not hang: the shape the plain
    /// wrapper produces for span 0. Lets a caller that rebuilt line text
    /// (the ellipsis clamp) re-enter the `WrappedLine` stream instead of
    /// keeping a parallel `hung` vector beside bare strings.
    pub fn plain(text: String) -> Self {
        WrappedLine {
            pieces: vec![RichPiece { span: 0, text }],
            hung: false,
        }
    }
}

/// Wraps styled spans to `max_width` pt, splitting paragraphs on `\n`
/// (which may sit inside any span). Returns lines of per-span pieces.
/// Same policy as the plain wrapper it generalizes: greedy fill, CJK
/// chars break anywhere, an over-wide token hard-breaks per char, and
/// [`LineBreak::Normal`] applies kinsoku per paragraph. No hanging
/// punctuation (see [`wrap_spans_hung`]).
pub fn wrap_spans(
    spans: &[RichSpan],
    max_width: f64,
    line_break: LineBreak,
) -> Vec<Vec<RichPiece>> {
    wrap_spans_hung(spans, max_width, line_break, HangingPunctuation::None)
        .into_iter()
        .map(|wl| wl.pieces)
        .collect()
}

/// [`wrap_spans`] with hanging punctuation: a line-terminating comma or
/// full stop hangs past the end edge instead of wrapping (`hanging` other
/// than `none`), and each returned line carries whether its trailing
/// punctuation is hung. The kinsoku pass is told to leave commas at line
/// starts so the hang pass can pull them up (the two run once each and act
/// on disjoint classes, so they always terminate).
pub fn wrap_spans_hung(
    spans: &[RichSpan],
    max_width: f64,
    line_break: LineBreak,
    hanging: HangingPunctuation,
) -> Vec<WrappedLine> {
    let stream: Vec<Styled> = spans
        .iter()
        .enumerate()
        .flat_map(|(si, s)| s.text.chars().map(move |c| (c, si)))
        .collect();
    let mut out: Vec<WrappedLine> = Vec::new();
    // `split` yields at least one (possibly empty) paragraph, and
    // wrap_paragraph pushes at least one line — never-empty result.
    for paragraph in stream.split(|&(c, _)| c == '\n') {
        let mut plines: Vec<Vec<Styled>> = Vec::new();
        wrap_paragraph(spans, paragraph, max_width, &mut plines);
        // Per-paragraph fixups: a prohibited char must not be pulled across
        // a `\n` boundary. Every mode but `anywhere` applies kinsoku.
        if line_break != LineBreak::Anywhere {
            apply_kinsoku(&mut plines, line_break, hanging);
        }
        let hung = apply_hang(&mut plines, hanging, line_break);
        for (line, h) in plines.into_iter().zip(hung) {
            out.push(WrappedLine {
                pieces: to_pieces(line),
                hung: h,
            });
        }
    }
    out
}

fn wrap_paragraph(
    spans: &[RichSpan],
    paragraph: &[Styled],
    max_width: f64,
    lines: &mut Vec<Vec<Styled>>,
) {
    if paragraph.is_empty() {
        lines.push(Vec::new());
        return;
    }

    let mut current: Vec<Styled> = Vec::new();
    let mut current_width = 0.0_f64;

    let push_line =
        |current: &mut Vec<Styled>, current_width: &mut f64, lines: &mut Vec<Vec<Styled>>| {
            let mut line = std::mem::take(current);
            while line.last().is_some_and(|&(c, _)| c.is_whitespace()) {
                line.pop();
            }
            lines.push(line);
            *current_width = 0.0;
        };

    for token in tokenize(spans, paragraph) {
        let (piece, atomic): (Vec<Styled>, bool) = match token {
            Token::Word(w) => (w, false),
            Token::Cjk(c) => (vec![c], false),
            Token::All(a) => (a, true),
            Token::Space(s) => {
                // Spaces never start a new line; they just accumulate.
                if !current.is_empty() {
                    current_width += s.iter().map(|&sc| width_of(spans, sc)).sum::<f64>();
                    current.extend(s);
                }
                continue;
            }
        };
        let piece_width: f64 = token_width(spans, &piece);

        // Note: an empty `current` always has width 0, so the two clauses
        // collapse to "the piece fits the remaining space".
        if current_width + piece_width <= max_width {
            current.extend(piece);
            current_width += piece_width;
            continue;
        }

        if piece_width <= max_width || atomic {
            // An atomic (`all`) token wider than the whole line still
            // places whole on its own line: it draws as ONE cell, so a
            // hard-break could only desynchronize measure and draw. The
            // caller's overflow policy sees the oversized extent. (An
            // oversized atomic token with nothing pending must not open
            // an empty line first.)
            if !current.is_empty() {
                push_line(&mut current, &mut current_width, lines);
            }
            current.extend(piece);
            current_width += piece_width;
            continue;
        }

        // The token alone exceeds the line: hard-break char by char.
        for sc in piece {
            let cw = width_of(spans, sc);
            // Thai clusters must not be cut on either side. A vowel or tone
            // mark attaches to the character BEFORE it, so it never opens a
            // line; a leading vowel (เ แ โ ใ ไ) is written before the
            // consonant it belongs to, so a line never ends with one. Either
            // break would draw the pair detached.
            // The leading-vowel half is bounded to the PAIR: a vowel
            // followed by another leading vowel is degenerate input (a
            // vowel is always pronounced after a consonant), and holding
            // those together too would let params drive one unbreakable
            // line of any length.
            let after_leading_vowel = current
                .last()
                .is_some_and(|&(c, _)| super::thai::is_thai_leading_vowel(c))
                && !super::thai::is_thai_leading_vowel(sc.0);
            let breakable = !super::thai::is_thai_combining(sc.0) && !after_leading_vowel;
            if breakable && !current.is_empty() && current_width + cw > max_width {
                push_line(&mut current, &mut current_width, lines);
            }
            current.push(sc);
            current_width += cw;
        }
    }

    // Trailing content (including whitespace-only lines) becomes a line.
    push_line(&mut current, &mut current_width, lines);
}

/// Applies kinsoku to already-wrapped lines by *pushing out* (push-out):
/// when a line would start with a prohibited character (per `mode`), or
/// end with one, the trailing character of the earlier line is moved down
/// to sit with it. Bounded and terminating — a line is never emptied (so
/// text is never lost and a pathological line just keeps its violation)
/// and each move strictly shrinks the earlier line. Moving a character can
/// leave the next line slightly wider than the box; that is the standard
/// kinsoku trade-off (hanging punctuation / oikomi squeeze are out of scope —
/// see TODO).
fn apply_kinsoku(lines: &mut [Vec<Styled>], mode: LineBreak, hanging: HangingPunctuation) {
    let hang_commas = super::hang::enabled(hanging);
    for i in 0..lines.len().saturating_sub(1) {
        // Keep pulling the earlier line's last char down while doing so
        // fixes a violation and leaves at least one char behind.
        while lines[i].len() > 1 {
            let ends_bad = lines[i].last().is_some_and(|&(c, _)| no_line_end(c));
            // When hanging is active, a *hangable* head (a comma whose
            // removal leaves a legal line start) is left for the hang pass
            // to pull up. Any other prohibited head — including a comma
            // glued to a closing bracket (。」) — is pushed out here, so
            // hanging never exposes a new violation.
            let starts_bad = lines[i + 1]
                .first()
                .is_some_and(|&(c, _)| no_line_start(c, mode))
                && !(hang_commas && hangable(&lines[i + 1], mode));
            if !ends_bad && !starts_bad {
                break;
            }
            // `len() > 1` guarantees the pop yields a char (the break
            // arm is the fail-closed guard, not a reachable path).
            let Some(moved) = lines[i].pop() else { break };
            lines[i + 1].insert(0, moved);
            // The pop can re-expose a trailing space that `push_line`
            // already stripped (`He said “` → `He said `), and the line
            // is measured over its whole text, so an unstripped space
            // shifts a centred or end-aligned line. Drop it the same way
            // the wrapper does — never emptying the line, which is the
            // invariant the outer guard keeps.
            while lines[i].len() > 1 && lines[i].last().is_some_and(|&(c, _)| c.is_whitespace()) {
                lines[i].pop();
            }
        }
    }
}

/// Merges a line's styled chars into per-span pieces, in reading order.
fn to_pieces(line: Vec<Styled>) -> Vec<RichPiece> {
    let mut pieces: Vec<RichPiece> = Vec::new();
    for (c, si) in line {
        match pieces.last_mut() {
            Some(piece) if piece.span == si => piece.text.push(c),
            _ => pieces.push(RichPiece {
                span: si,
                text: c.to_string(),
            }),
        }
    }
    pieces
}

#[cfg(test)]
mod tests;
