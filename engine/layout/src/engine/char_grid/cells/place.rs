//! Single-char placement for `char_grid` assignment: the school kinsoku
//! rule sets (hang-back punctuation, opening brackets) and the wrap-then-
//! place step every ordinary character routes through. Split from
//! [`super`] (the assignment engine) for the line budget.

use shojiku_core::{KinsokuMode, LinePlacement};

use super::{CellChar, Cursor, Sink};

/// Characters that hang back into the previous line's last cell instead
/// of starting a line (school kinsoku: trailing punctuation and closing
/// brackets share the last cell). A closed, deliberately small set —
/// extending it is a deliberate decision, not a drive-by edit.
fn hangs_back(c: char) -> bool {
    matches!(
        c,
        '、' | '。' | '，' | '．' | '！' | '？' | '」' | '』' | '）' | '〕' | '〉' | '》' | '｝'
    )
}

/// Characters that may not end a line (opening brackets): the cell is
/// left empty and the character starts the next line. Named `school_*`
/// because this is the genkoyoshi school-kinsoku set — the general-text
/// prohibition tables live in `wrap/kinsoku.rs` (which has a
/// `no_line_end` of its own); the two are deliberately separate.
fn school_no_line_end(c: char) -> bool {
    matches!(c, '「' | '『' | '（' | '〔' | '〈' | '《' | '【' | '｛')
}

/// Places one char, wrapping a full line first. School kinsoku: trailing
/// punctuation shares the last cell instead of opening the next line.
pub(super) fn place_wrapped(
    sink: &mut Sink,
    cur: &mut Cursor,
    ch: char,
    seg: usize,
    cpl: usize,
    kinsoku: KinsokuMode,
    placement: Option<LinePlacement>,
) {
    if cur.pos >= cpl {
        if kinsoku == KinsokuMode::School && hangs_back(ch) {
            sink.push(CellChar {
                line: cur.line,
                pos: cpl - 1,
                ch,
                combined: None,
                hang: true,
                seg,
                scale: 1,
                placement,
            });
            cur.line += 1;
            cur.pos = 0;
            cur.fresh_line = false;
            return;
        }
        cur.line += 1;
        cur.pos = 0;
    }
    place(sink, cur, ch, seg, cpl, kinsoku, placement);
}

/// Places one char at the cursor, applying the opening-bracket rule
/// (school: an opener never ends a line — its cell stays empty and it
/// starts the next line).
fn place(
    sink: &mut Sink,
    cur: &mut Cursor,
    ch: char,
    seg: usize,
    cpl: usize,
    kinsoku: KinsokuMode,
    placement: Option<LinePlacement>,
) {
    if kinsoku == KinsokuMode::School && school_no_line_end(ch) && cur.pos == cpl - 1 && cpl > 1 {
        cur.line += 1;
        cur.pos = 0;
    }
    sink.push(CellChar {
        line: cur.line,
        pos: cur.pos,
        ch,
        combined: None,
        hang: false,
        seg,
        scale: 1,
        placement,
    });
    cur.pos += 1;
    cur.fresh_line = false;
}
