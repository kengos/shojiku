//! Aozora-bunko markup (`|base《reading》` ruby + `［＃…］` notes) — the
//! `markup: aozora` grammar for `char_grid` content. Single linear
//! char-level pass over untrusted strings: malformed markup degrades to
//! literal text plus a warning, never an error or a panic. The note-body
//! grammars ([`grammar`]) and the `《…》` machinery ([`reading`]) live in
//! submodules; this file is the top-level pass and its parser state.

mod grammar;
mod note;
mod placement;
mod reading;
#[cfg(test)]
mod tests;
mod warning;

pub use note::MAX_NOTE_LEN;
pub use placement::LinePlacement;
pub use warning::RubyWarning;

use grammar::NoteKind;
use note::{scan_note, Note};

/// Cap on one reading's length in chars. Untrusted params drive the
/// parser; a reading past the cap renders literally (with a warning)
/// instead of feeding unbounded ruby runs into layout.
pub const MAX_RUBY_LEN: usize = 64;

/// A run of base text with an optional ruby reading over the whole run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RubySegment {
    pub text: String,
    pub ruby: Option<String>,
    /// A `［＃改ページ］` note precedes this run: it starts a new sheet.
    /// Leading and consecutive breaks collapse — the parser carries one
    /// flag to the next run, and cell assignment treats a break at a
    /// fresh sheet start as a no-op.
    pub sheet_break: bool,
    /// A large-writing note enlarges this run: each character is drawn across a
    /// `scale × scale` block of cells. `None` = ordinary one-cell-per-char.
    pub scale: Option<usize>,
    /// A placement note (`［＃…字下げ］` etc.) opens the source line this
    /// run starts; the placement governs the whole line until the next
    /// `\n`. `None` = the line uses the item's own `textAlign`.
    pub placement: Option<LinePlacement>,
}

/// The running state of one `parse_aozora_ruby` pass. Grouped so the
/// per-char match arms read as small transitions rather than juggling six
/// locals.
struct Parser {
    segments: Vec<RubySegment>,
    warnings: Vec<RubyWarning>,
    /// Plain text accumulated since the last emitted segment.
    plain: String,
    /// Explicit base being collected since a `|` (None = no bar pending).
    bar: Option<String>,
    /// A sheet break seen since the last flush; the next segment claims
    /// it, so content ending in a break drops it (it would add no sheet).
    brk: bool,
    /// A placement note seen for the source line now being built; the next
    /// segment claims it. Reset at every `\n`.
    place: Option<LinePlacement>,
    /// Whether the cursor sits at a source line head (stream start, just
    /// after a `\n`, or just after a sheet break) — placement notes are
    /// only honored there.
    at_line_head: bool,
}

/// Splits `input` into ruby segments. Plain text between readings merges
/// into `ruby: None` segments; `|` scopes the next reading's base
/// explicitly, otherwise the base is the maximal preceding kanji run
/// (falling back to the single preceding char after kana/Latin). A
/// `［＃改ページ］` note flags the segment that follows it; a large-writing note
/// scales the text just before it; a placement note governs the source
/// line it opens; every other `［＃…］` note stays literal and warns.
pub fn parse_aozora_ruby(input: &str) -> (Vec<RubySegment>, Vec<RubyWarning>) {
    let mut p = Parser {
        segments: Vec::new(),
        warnings: Vec::new(),
        plain: String::new(),
        bar: None,
        brk: false,
        place: None,
        at_line_head: true,
    };
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '|' | '｜' => p.on_bar(),
            // A note only outside an explicit base: inside `|…《》` the
            // author is spelling a reading's base, not annotating flow.
            '［' if p.bar.is_none() && chars.peek() == Some(&'＃') => {
                chars.next();
                p.on_note(&mut chars);
            }
            '《' => {
                let (ruby, closed) = reading::take_reading(&mut chars);
                p.on_reading(ruby, closed);
            }
            '\n' => p.on_newline(),
            other => p.on_char(other),
        }
    }
    p.finish()
}

impl Parser {
    /// A `|` (or `｜`): open a new explicit base. A pending one was a
    /// dangling bar.
    fn on_bar(&mut self) {
        if let Some(pending) = self.bar.replace(String::new()) {
            self.warnings.push(RubyWarning::DanglingBar);
            self.plain.push_str(&pending);
        }
    }

    /// Any ordinary character: into the pending base if one is open, else
    /// the plain buffer. It leaves the line head.
    fn on_char(&mut self, c: char) {
        self.at_line_head = false;
        match &mut self.bar {
            Some(base) => base.push(c),
            None => self.plain.push(c),
        }
    }

    /// A raw `\n`: it terminates the current source line. Flushing here
    /// keeps a plain segment from spanning a line boundary, so each
    /// segment's `placement` names exactly one source line. The `\n`
    /// stays in the flushed text (assignment advances the line on it).
    fn on_newline(&mut self) {
        self.plain.push('\n');
        self.flush_plain();
        self.place = None;
        self.at_line_head = true;
    }

    /// A closed-or-not `《…》`: annotate the chosen base, or render the
    /// whole thing literally with a warning.
    fn on_reading(&mut self, ruby: String, closed: bool) {
        let base = reading::take_base(&mut self.plain, &mut self.bar);
        match reading::check_reading(closed, &base, &ruby) {
            None => {
                self.at_line_head = false;
                self.flush_plain();
                self.segments.push(RubySegment {
                    text: base,
                    ruby: Some(ruby),
                    sheet_break: std::mem::take(&mut self.brk),
                    scale: None,
                    placement: self.place,
                });
            }
            Some(warning) => {
                self.warnings.push(warning);
                self.plain.push_str(&base);
                self.plain.push('《');
                self.plain.push_str(&ruby);
                if closed {
                    self.plain.push('》');
                }
                self.at_line_head = false;
            }
        }
    }

    /// A `［＃` opener: scan the body and act on whichever grammar it fits.
    fn on_note(&mut self, chars: &mut impl Iterator<Item = char>) {
        match scan_note(chars) {
            Note::SheetBreak => {
                self.flush_plain();
                self.brk = true;
                self.place = None;
                self.at_line_head = true;
            }
            Note::Body(body) => self.on_note_body(body),
            Note::Unclosed(scanned) => {
                self.warnings.push(RubyWarning::NoteUnclosed);
                self.plain.push_str("［＃");
                self.plain.push_str(&scanned);
                self.at_line_head = false;
            }
        }
    }

    /// A well-formed note body: large-writing scales the preceding text, a
    /// placement opens the line, anything else renders literally.
    fn on_note_body(&mut self, body: String) {
        match grammar::classify(&body) {
            NoteKind::Large { target, scale } => self.apply_large(&body, &target, scale),
            NoteKind::Place(placement) => self.apply_placement(&body, placement),
            NoteKind::PlaceZero => {
                self.warnings.push(RubyWarning::PlacementZero);
                self.echo_note(&body);
            }
            NoteKind::Unknown => {
                self.warnings.push(RubyWarning::NoteIgnored(body.clone()));
                self.echo_note(&body);
            }
        }
    }

    /// `［＃「target」は…大書き］`: scale is invalid (< 2), or the target
    /// must be the text just before the note — the pending plain tail, or
    /// the last emitted segment when the note follows `《》` directly.
    fn apply_large(&mut self, body: &str, target: &str, scale: usize) {
        if scale < 2 {
            self.warnings.push(RubyWarning::LargeScaleInvalid);
            return self.echo_note(body);
        }
        if !target.is_empty() && self.plain.ends_with(target) && self.bar.is_none() {
            let base = self.plain.split_off(self.plain.len() - target.len());
            self.at_line_head = false;
            self.flush_plain();
            self.segments.push(RubySegment {
                text: base,
                ruby: None,
                sheet_break: std::mem::take(&mut self.brk),
                scale: Some(scale),
                placement: self.place,
            });
            return;
        }
        if !target.is_empty() && self.plain.is_empty() && self.bar.is_none() {
            if let Some(last) = self.segments.last_mut() {
                if last.text == target {
                    last.scale = Some(scale);
                    return;
                }
            }
        }
        self.warnings.push(RubyWarning::LargeNoTarget);
        self.echo_note(body);
    }

    /// A placement note: honored only at a source line head, and only
    /// once per line.
    fn apply_placement(&mut self, body: &str, placement: LinePlacement) {
        if !self.at_line_head {
            self.warnings.push(RubyWarning::PlacementNotAtLineHead);
            return self.echo_note(body);
        }
        if self.place.is_some() {
            self.warnings.push(RubyWarning::PlacementDuplicate);
            return self.echo_note(body);
        }
        self.place = Some(placement);
    }

    /// Render a note literally (its `［＃…］` form) in the plain buffer,
    /// leaving the line head — a literal note is content.
    fn echo_note(&mut self, body: &str) {
        self.plain.push_str("［＃");
        self.plain.push_str(body);
        self.plain.push('］');
        self.at_line_head = false;
    }

    /// Moves the pending plain buffer into a `ruby: None` segment,
    /// claiming any pending sheet break and the line's placement. An empty
    /// buffer emits nothing and leaves both for the next segment.
    fn flush_plain(&mut self) {
        if !self.plain.is_empty() {
            self.segments.push(RubySegment {
                text: std::mem::take(&mut self.plain),
                ruby: None,
                sheet_break: std::mem::take(&mut self.brk),
                scale: None,
                placement: self.place,
            });
        }
    }

    /// Drains any pending base and flushes the tail.
    fn finish(mut self) -> (Vec<RubySegment>, Vec<RubyWarning>) {
        if let Some(pending) = self.bar.take() {
            self.warnings.push(RubyWarning::DanglingBar);
            self.plain.push_str(&pending);
        }
        self.flush_plain();
        (self.segments, self.warnings)
    }
}
