//! `［＃…］` aozora notes inside `markup: aozora` content: the
//! scan that finds a note's body and recognizes the sheet break. What every
//! other body means is [`super::grammar`]'s job. Bounded scanning over
//! untrusted strings — a note that does not close within the cap degrades
//! to literal text, never a hang.

/// Cap on one note's body length in chars. Untrusted params drive the
/// scan, so text past the cap is not a note (it renders literally); this
/// also bounds the body a [`Note::Body`] carries into a diagnostic.
pub const MAX_NOTE_LEN: usize = 64;

/// The one note the scan itself recognizes; the rest is grammar.
const SHEET_BREAK: &str = "改ページ";

/// What a `［＃` opener turned out to be.
pub(super) enum Note {
    /// `［＃改ページ］`: the content after it starts a new sheet.
    SheetBreak,
    /// A well-formed note's body (at most [`MAX_NOTE_LEN`] chars) — the
    /// caller classifies it and, failing that, renders it literally and
    /// echoes the body in a diagnostic.
    Body(String),
    /// No `］` within the cap. Carries the scanned text, which renders
    /// literally along with the opener.
    Unclosed(String),
}

/// Scans one note's body; the caller has consumed the `［＃` opener.
/// Reads at most [`MAX_NOTE_LEN`] body chars plus the closer, so a
/// `［＃` in a long hostile string cannot drive an unbounded scan.
pub(super) fn scan_note(chars: &mut impl Iterator<Item = char>) -> Note {
    let mut body = String::new();
    for _ in 0..=MAX_NOTE_LEN {
        match chars.next() {
            Some('］') if body == SHEET_BREAK => return Note::SheetBreak,
            Some('］') => return Note::Body(body),
            Some(c) => body.push(c),
            None => break,
        }
    }
    Note::Unclosed(body)
}
