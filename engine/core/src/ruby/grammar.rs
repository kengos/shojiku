//! `［＃…］` note-body grammars beyond the sheet break: the large-writing span notes
//! and the per-line placement notes. Pure classification of a body the
//! scan already captured and length-capped — no state, no I/O, so hostile
//! bodies are unit-testable on their own.

use super::LinePlacement;

/// Cells a large-writing note enlarges to when it names no multiplier
/// (`［＃「会話」は大書き］` = 2×2 — the genkoyoshi convention).
const DEFAULT_SCALE: usize = 2;

/// Cap on a note's digit run. Two digits bound every value the grid can
/// use (cells per line is far under 100) and keep the parse overflow-free;
/// a longer run is not a number, so the body renders literally.
const MAX_DIGITS: usize = 2;

/// What a well-formed `［＃…］` body asks for.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum NoteKind {
    /// `「<target>」は[Ｎ倍の]大書き`: draw `target` across n×n cells each.
    Large { target: String, scale: usize },
    /// A per-line placement note.
    Place(LinePlacement),
    /// A placement note asking to move 0 cells — recognized, but it would
    /// move nothing.
    PlaceZero,
    /// A body the engine does not act on; it renders literally.
    Unknown,
}

/// Classifies one captured note body. The sheet break is the scan's own job, so
/// it never reaches here.
pub(super) fn classify(body: &str) -> NoteKind {
    large(body)
        .or_else(|| placement(body))
        .unwrap_or(NoteKind::Unknown)
}

/// `「<target>」は大書き` / `「<target>」はＮ倍の大書き`. The target is
/// taken up to the FIRST `」`, so a target containing one does not parse
/// (the body stays literal) rather than binding something unintended.
fn large(body: &str) -> Option<NoteKind> {
    let rest = body.strip_prefix('「')?;
    let (target, rest) = rest.split_once('」')?;
    let mid = rest.strip_prefix('は')?.strip_suffix("大書き")?;
    let scale = match mid {
        "" => DEFAULT_SCALE,
        mid => {
            let (n, tail) = take_digits(mid)?;
            if tail != "倍の" {
                return None;
            }
            n
        }
    };
    Some(NoteKind::Large {
        target: target.to_string(),
        scale,
    })
}

/// `Ｎ字下げ` / `地付き` / `地からＮ字上げ` / `中央`.
fn placement(body: &str) -> Option<NoteKind> {
    match body {
        "中央" => return Some(NoteKind::Place(LinePlacement::Center)),
        "地付き" => return Some(NoteKind::Place(LinePlacement::FlushEnd { raise: 0 })),
        _ => {}
    }
    if let Some(mid) = body
        .strip_prefix("地から")
        .and_then(|s| s.strip_suffix("字上げ"))
    {
        let (n, tail) = take_digits(mid)?;
        return tail
            .is_empty()
            .then(|| zero_or(n, LinePlacement::FlushEnd { raise: n }));
    }
    let mid = body.strip_suffix("字下げ")?;
    let (n, tail) = take_digits(mid)?;
    tail.is_empty()
        .then(|| zero_or(n, LinePlacement::Indent(n)))
}

/// A note naming a cell count of 0 moves nothing: recognized, but
/// reported rather than applied — `［＃地付き］` is how a plain end-flush
/// is written, so `［＃地から０字上げ］` is a mistake, not a synonym.
fn zero_or(n: usize, place: LinePlacement) -> NoteKind {
    match n {
        0 => NoteKind::PlaceZero,
        _ => NoteKind::Place(place),
    }
}

/// The leading digit run (fullwidth or ASCII) and what follows it.
/// `None` when there are no digits or more than [`MAX_DIGITS`] of them —
/// an unrecognized body renders literally, so a long run is not a number.
fn take_digits(s: &str) -> Option<(usize, &str)> {
    let (mut value, mut count) = (0usize, 0usize);
    for (i, c) in s.char_indices() {
        let Some(d) = digit(c) else {
            return (count > 0).then_some((value, &s[i..]));
        };
        count += 1;
        if count > MAX_DIGITS {
            return None;
        }
        value = value * 10 + d;
    }
    (count > 0).then_some((value, ""))
}

/// One decimal digit, fullwidth (`０-９`) or ASCII — aozora texts use the
/// fullwidth forms, hand-authored templates reach for ASCII.
fn digit(c: char) -> Option<usize> {
    let zero = match c {
        '0'..='9' => '0',
        '０'..='９' => '０',
        _ => return None,
    };
    Some(u32::from(c).wrapping_sub(u32::from(zero)) as usize)
}
