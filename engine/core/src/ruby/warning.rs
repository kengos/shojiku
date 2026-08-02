//! Recoverable aozora-markup mistakes: what the parser reports when
//! notation is well-formed enough to recognize but not to act on. Every
//! variant leaves the offending characters literal, so a warning never
//! costs the author their text.

/// A recoverable markup mistake; the offending characters stay literal.
/// Messages echo nothing attacker-controlled; the one variant that names
/// its input ([`RubyWarning::NoteIgnored`]) carries a body the note scan
/// already capped.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RubyWarning {
    /// `《` was never closed; rendered literally.
    Unclosed,
    /// `《》` with an empty reading; rendered literally.
    EmptyRuby,
    /// A reading with no base text before it; rendered literally.
    NoBase,
    /// A reading longer than [`super::MAX_RUBY_LEN`] chars; rendered
    /// literally.
    RubyTooLong,
    /// `|` with no `《reading》` following it; rendered literally.
    DanglingBar,
    /// `［＃` with no `］` within [`super::MAX_NOTE_LEN`] chars; rendered
    /// literally.
    NoteUnclosed,
    /// A well-formed `［＃…］` note the engine does not act on (only
    /// the sheet break, the large-writing notes, and the placement notes are). Carries
    /// the note body — capped by the scan, so a diagnostic may echo it —
    /// and the note renders literally.
    NoteIgnored(String),
    /// A large-writing note whose `「…」` text is not the text just before it
    /// (or is empty); rendered literally.
    LargeNoTarget,
    /// A large-writing note asking for a multiplier below 2 — nothing to
    /// enlarge; rendered literally.
    LargeScaleInvalid,
    /// A placement note away from a source line head: placement is a
    /// property of the whole line, so it may only open one. Rendered
    /// literally.
    PlacementNotAtLineHead,
    /// A second placement note on one source line; the line can sit in
    /// only one place. Rendered literally.
    PlacementDuplicate,
    /// A placement note whose cell count is 0 (`［＃０字下げ］`,
    /// `［＃地から０字上げ］`) — it would move nothing. `［＃地付き］` is
    /// the way to write a plain end-flush. Rendered literally.
    PlacementZero,
}

impl RubyWarning {
    /// Static description for diagnostics (no input echo by design).
    /// [`RubyWarning::NoteIgnored`] names its note through its own
    /// diagnostic argument instead, so its description stays generic.
    pub fn message(&self) -> &'static str {
        match self {
            RubyWarning::Unclosed => "`《` is never closed; rendered literally",
            RubyWarning::EmptyRuby => "`《》` has an empty reading; rendered literally",
            RubyWarning::NoBase => "a `《reading》` has no base text; rendered literally",
            RubyWarning::RubyTooLong => "a ruby reading is over the length cap; rendered literally",
            RubyWarning::DanglingBar => "`|` has no `《reading》` after it; rendered literally",
            RubyWarning::NoteUnclosed => {
                "`［＃` has no `］` within the note length cap; rendered literally"
            }
            RubyWarning::NoteIgnored(_) => {
                "an aozora note the engine does not act on; rendered literally"
            }
            RubyWarning::LargeNoTarget => {
                "a `大書き` note's `「…」` text does not sit just before it; rendered literally"
            }
            RubyWarning::LargeScaleInvalid => {
                "a `大書き` note asks for a multiplier below 2; rendered literally"
            }
            RubyWarning::PlacementNotAtLineHead => {
                "a placement note is not at the start of a line; rendered literally"
            }
            RubyWarning::PlacementDuplicate => {
                "a second placement note on one line; rendered literally"
            }
            RubyWarning::PlacementZero => {
                "a placement note asks to move 0 cells; rendered literally"
            }
        }
    }
}
