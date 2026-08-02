//! Ruby (furigana) readings on text items: template-authored
//! `ruby: [{ base, text }]` pairs matched against the DRAWN text of a
//! finished block (post-policy, so what the reader sees is what is
//! annotated) and emitted as small ordinary [`crate::tree::TextBlock`]s —
//! beside the base column (vertical, JLREQ) or above the base run
//! (horizontal) — so the renderers need no ruby knowledge. This root
//! holds the pure shared machinery (matching, proportional splits, cell
//! extents); the axis appliers live in [`vertical`] / [`horizontal`],
//! and the per-line glyph-cell builders in [`cells`].

mod cells;
mod horizontal;
#[cfg(test)]
mod tests;
mod vertical;

use std::ops::Range;

use shojiku_core::{RubyPair, MAX_RUBY_ENTRIES, MAX_RUBY_LEN};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};

use crate::tree::LayoutItem;

/// Readings smaller than this are unreadable in print; the shrink stops
/// here and the reading overflows its base run (warned once per item).
const MIN_RUBY_PT: f64 = 4.0;

/// Shrink-to-fit with the print floor.
fn fit(preferred: f64, fitted: f64) -> f64 {
    preferred.min(fitted).max(MIN_RUBY_PT)
}

/// Whether a base/reading exceeds the per-entry char cap
/// ([`MAX_RUBY_LEN`]) — mirrors the validate-time check (the base is a
/// search needle over params-driven content, so its length is bounded to
/// keep the scan linear).
fn over_cap(s: &str) -> bool {
    s.chars().count() > MAX_RUBY_LEN
}

/// One glyph cell of a drawn line along its writing axis, as the ruby
/// matcher consumes it: the byte range it covers within the line's
/// JOINED text, its along-axis start and advance, and its owning run's
/// font size / cross-axis band offset (rich runs differ per span).
struct Cell {
    /// Byte range within the line's joined text (rich runs re-based).
    source: Range<usize>,
    /// Along-axis start: down-offset from the column top (vertical, the
    /// run offset folded in) or the absolute page x (horizontal).
    at: f64,
    /// Along-axis extent of the cell.
    advance: f64,
    /// The owning run's font size (drives the reading's cross-axis
    /// placement beside/above ITS base run).
    size: f64,
    /// Horizontal only: the owning run's em-top offset from the line's
    /// top (`0` for plain blocks and every vertical cell).
    top: f64,
}

/// One base slice matched on one line: where the reading part goes.
struct MatchedRun {
    line: usize,
    /// Byte range within that line's joined text.
    range: Range<usize>,
    /// The reading share for this slice (proportional split).
    reading: String,
}

/// Matches every ruby entry against the drawn line texts, in listed
/// order, non-overlapping (each search starts after the previous match,
/// over the lines' concatenation). Malformed entries are skipped
/// (validate already warned); unmatched bases warn `ruby_base_not_found`.
/// Returns one [`MatchedRun`] per line-contiguous slice, reading split
/// proportionally by the slice's char count.
fn match_entries(
    line_texts: &[String],
    ruby: &[RubyPair],
    diags: &mut Diagnostics,
) -> Vec<MatchedRun> {
    let joined: String = line_texts.concat();
    let mut cursor = 0usize;
    let mut out = Vec::new();
    for pair in ruby.iter().take(MAX_RUBY_ENTRIES) {
        if pair.base.is_empty() || pair.text.is_empty() {
            continue;
        }
        if over_cap(&pair.base) || over_cap(&pair.text) {
            continue;
        }
        let Some(at) = joined[cursor..].find(&pair.base) else {
            diags.push(Diagnostic::new(Code::RubyBaseNotFound).arg("base", pair.base.as_str()));
            continue;
        };
        let start = cursor + at;
        cursor = start + pair.base.len();
        let slices = locate(line_texts, start..cursor);
        let weights: Vec<usize> = slices
            .iter()
            .map(|s| line_texts[s.line][s.range.clone()].chars().count())
            .collect();
        let readings = split_reading(&pair.text, &weights);
        for (slice, reading) in slices.into_iter().zip(readings) {
            if reading.is_empty() {
                continue;
            }
            out.push(MatchedRun {
                line: slice.line,
                range: slice.range,
                reading,
            });
        }
    }
    out
}

/// One line-contiguous slice of a matched base: the line it sits on and
/// its byte range within that line's text.
struct Slice {
    line: usize,
    range: Range<usize>,
}

/// Maps a byte range of the JOINED line text onto per-line local ranges,
/// in line order. Pure over the line texts.
fn locate(lines: &[String], range: Range<usize>) -> Vec<Slice> {
    let mut slices = Vec::new();
    let mut base = 0usize;
    for (i, line) in lines.iter().enumerate() {
        let end = base + line.len();
        let lo = range.start.max(base);
        let hi = range.end.min(end);
        if lo < hi {
            slices.push(Slice {
                line: i,
                range: (lo - base)..(hi - base),
            });
        }
        base = end;
    }
    slices
}

/// Splits a reading over its base's line slices, proportionally by each
/// slice's char count (a base wrapping 3+1 chars gets 3/4 then 1/4 of the
/// reading) — the char_grid convention. Pure; returns one slice per
/// weight, in order, covering every reading char exactly once.
fn split_reading(reading: &str, weights: &[usize]) -> Vec<String> {
    let chars: Vec<char> = reading.chars().collect();
    let total: usize = weights.iter().sum();
    if total == 0 {
        return weights.iter().map(|_| String::new()).collect();
    }
    let mut out = Vec::with_capacity(weights.len());
    let (mut consumed, mut start) = (0usize, 0usize);
    for (i, w) in weights.iter().enumerate() {
        consumed += w;
        let end = if i + 1 == weights.len() {
            chars.len()
        } else {
            (chars.len() * consumed + total / 2) / total
        };
        let end = end.clamp(start, chars.len());
        out.push(chars[start..end].iter().collect());
        start = end;
    }
    out
}

/// The along-axis start/extent of the cells intersecting `range`, plus
/// the first intersecting cell's run size and band offset (which place
/// the reading beside/above ITS base run). `None` when nothing
/// intersects (an arrangement/matching mismatch must skip, never panic).
struct SliceExtent {
    at: f64,
    extent: f64,
    size: f64,
    top: f64,
}

fn slice_extent(cells: &[Cell], range: &Range<usize>) -> Option<SliceExtent> {
    let mut lo = f64::INFINITY;
    let mut hi = f64::NEG_INFINITY;
    let mut first: Option<(f64, f64)> = None;
    for c in cells {
        if c.source.start < range.end && c.source.end > range.start {
            if first.is_none() || c.at < lo {
                first = Some((c.size, c.top));
            }
            lo = lo.min(c.at);
            hi = hi.max(c.at + c.advance);
        }
    }
    let (size, top) = first?;
    (lo.is_finite() && hi > lo).then_some(SliceExtent {
        at: lo,
        extent: hi - lo,
        size,
        top,
    })
}

/// Appends the reading blocks beside their base block: into a
/// `textOverflow: clip` wrapper when one exists (readings must clip with
/// their block), else onto the atom's own items.
fn push_ruby_items(items: &mut Vec<LayoutItem>, ruby: Vec<LayoutItem>) {
    let mut ruby = Some(ruby);
    for item in items.iter_mut() {
        if let LayoutItem::Clip(clip) = item {
            if let Some(r) = ruby.take() {
                clip.items.extend(r);
            }
            return;
        }
    }
    if let Some(r) = ruby.take() {
        items.extend(r);
    }
}
