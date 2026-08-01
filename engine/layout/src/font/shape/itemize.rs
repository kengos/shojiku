//! Face itemization: split a run into maximal segments that one face
//! covers, using the same per-char first-covering-face rule the pre-shaping
//! code used. Chars no face maps become `face: None` segments that bypass
//! the shaper and keep the missing-glyph advance policy (`super::shape_run`).

use crate::font::FontFace;
use std::ops::Range;

/// One shaping segment: a byte range of the run and the chain index of the
/// face that covers it (`None` = no face maps these chars — the per-char
/// missing-glyph path handles them, never the shaper).
pub(crate) struct Segment {
    pub face: Option<usize>,
    pub range: Range<usize>,
}

/// Index of the first chain face mapping `c`, or `None` when no face in
/// the chain covers it.
pub(super) fn face_for(chain: &[&FontFace], c: char) -> Option<usize> {
    chain.iter().position(|f| f.glyph_id(c).is_some())
}

/// Splits `text` into maximal same-face segments (byte ranges). Adjacent
/// chars sharing a covering-face index (or both uncovered) stay in one
/// segment, so the shaper sees the longest possible run per face.
pub(crate) fn itemize(chain: &[&FontFace], text: &str) -> Vec<Segment> {
    let mut segments: Vec<Segment> = Vec::new();
    for (i, c) in text.char_indices() {
        let face = face_for(chain, c);
        let end = i + c.len_utf8();
        match segments.last_mut() {
            Some(seg) if seg.face == face => seg.range.end = end,
            _ => segments.push(Segment {
                face,
                range: i..end,
            }),
        }
    }
    segments
}
