//! The one bounded-echo guard, and the type that applies it structurally.
//!
//! Every surface that quotes a template, a params document, a font manifest
//! or a locale id back to a human is echoing bytes an attacker chose. Three
//! things can go wrong with such an echo, and only the first is obvious:
//! it can run unbounded (a nuisance in a log, a denial of service in a
//! reporter); it can carry CONTROL characters — an escape sequence that
//! repaints a terminal, or a newline that forges a second log line; and it
//! can carry BIDIRECTIONAL formatting characters, which reorder how the rest
//! of the line displays without changing a byte of it.
//!
//! [`sanitize`] is the single implementation of all three guards for the
//! whole workspace. The CAP stays a per-site parameter, because the right
//! bound genuinely differs: one echoed value ([`MAX_ECHO`]), a whole
//! assembled message at a host boundary ([`MAX_MESSAGE`]), or a domain value
//! that is only ever a few characters (a currency code). What may NOT differ
//! is which characters get stripped.
//!
//! [`Echo`] is that guard as a TYPE. An error enum whose field is an `Echo`
//! rather than a `String` cannot be constructed with unsanitized text, so
//! the decision survives the next variant somebody adds — the same reasoning
//! `shojiku_signing`'s `assert_errors_are_bounded!` applies to the surface
//! that has nothing useful to quote back. This is the answer for the other
//! kind of surface: an authoring error's job IS to quote the key the author
//! mistyped, so it clips instead of refusing to hold the text.

use std::fmt;
use std::path::Path;

/// The longest a single echoed VALUE may be — a field path, a pack id, a
/// file name. Matches the diagnostics arg cap so a value is bounded the same
/// way whether it reaches a human through an error or through a diagnostic.
pub const MAX_ECHO: usize = 200;

/// The longest a whole assembled MESSAGE may be at a host echo boundary
/// (CLI stderr, the `--report` sidecar, the capi status wire, a thrown JS
/// error). Larger than [`MAX_ECHO`] because such a message is prose plus
/// possibly several already-bounded values.
pub const MAX_MESSAGE: usize = 400;

/// The cap for a value composed INTO a message that then occupies a single
/// diagnostic arg — `format!("asset `{value}`: {reason}")` handed to one
/// `.arg("detail", …)`.
///
/// Deliberately a fraction of [`MAX_ECHO`]. The arg itself is clipped at
/// `MAX_ECHO`, so a value allowed that whole budget pushes the PROSE
/// explaining the failure out of the message entirely — the reader gets a
/// wall of the hostile string and never learns what was wrong with it, at
/// exactly the moment they need to. Leaving the majority of the budget to
/// the prose keeps the reason readable no matter what the document contains.
///
/// Prefer giving the value its own arg where the code's template allows it;
/// this is for the codes whose template is a single slot.
pub const MAX_INLINE_ECHO: usize = 80;

/// A message is prose plus possibly several already-bounded values, so it
/// must have at least as much room as one of them. Handed to the compiler
/// rather than left as a convention, since the constants are edited
/// independently.
const _: () = assert!(
    MAX_MESSAGE >= MAX_ECHO,
    "a whole message may not be bounded more tightly than one value inside it",
);

/// An inline value must leave room for the prose around it, or the bound it
/// is under defeats its own purpose.
const _: () = assert!(
    MAX_INLINE_ECHO * 2 <= MAX_ECHO,
    "a value composed into a message may take at most half the arg budget, \
     so the text explaining the failure always survives beside it",
);

/// Whether `c` may not appear in an echo.
///
/// Two families, for two different attacks:
///
/// - **Control characters** — an escape sequence repaints a terminal, a
///   newline forges a second log line, a NUL truncates a C string.
/// - **Bidirectional formatting characters** — the "Trojan Source" family.
///   These are not control characters (Unicode calls them format
///   characters), so `char::is_control` misses every one of them, and they
///   reorder how the rest of the line DISPLAYS without changing its bytes.
///   An echo is exactly where that matters: the whole point of quoting a
///   key back is that the reader can see which key it was.
///
/// Deliberately narrow: it does not strip every format character, because
/// the zero-width joiner and non-joiner are meaningful inside real text
/// (Indic scripts, Arabic, emoji sequences) and removing them would corrupt
/// a legitimate key rather than defuse a hostile one.
fn is_unsafe_echo_char(c: char) -> bool {
    c.is_control()
        || matches!(c,
            '\u{061c}'                  // arabic letter mark
            | '\u{200e}' | '\u{200f}'   // ltr / rtl mark
            | '\u{202a}'..='\u{202e}'   // embeddings + overrides
            | '\u{2066}'..='\u{2069}'   // isolates
        )
}

/// Strips unsafe characters and clips to `max` CHARACTERS (not bytes, so a
/// multi-byte script is not cut mid-scalar).
///
/// Stripping happens BEFORE clipping, so a hostile string cannot push an
/// escape sequence past the cap and out of reach of the filter.
pub fn sanitize(s: &str, max: usize) -> String {
    s.chars()
        .filter(|c| !is_unsafe_echo_char(*c))
        .take(max)
        .collect()
}

/// [`sanitize`], plus a trailing `…` when the value was actually cut, so a
/// reader can tell a short value from a truncated one.
///
/// Use this for text a HUMAN reads (an error message); use plain
/// [`sanitize`] for a value a consumer re-renders from (a diagnostic arg),
/// where the marker would be engine prose leaking into data.
pub fn sanitize_marked(s: &str, max: usize) -> String {
    let mut out = sanitize(s, max);
    // Must filter by the SAME predicate `sanitize` uses, or the marker
    // claims a truncation that did not happen (or misses one that did).
    if s.chars()
        .filter(|c| !is_unsafe_echo_char(*c))
        .nth(max)
        .is_some()
    {
        out.push('…');
    }
    out
}

/// A bounded, control-free echo of attacker-controlled text.
///
/// Construct it through the `From` impls; there is no way to build one that
/// skips the guard. A clipped value ends in `…` so a reader can tell the
/// difference between a short value and a truncated one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Echo(String);

impl Echo {
    /// Sanitizes `s` to [`MAX_ECHO`], marking the result when it was cut.
    pub fn new(s: &str) -> Self {
        Echo::clipped_to(s, MAX_ECHO)
    }

    /// Sanitizes `s` to a caller-chosen cap.
    ///
    /// Use this where the DOMAIN bounds the value more tightly than the
    /// generic echo cap does — a locale id that is invalid past 64
    /// characters has nothing to say in characters 65..200, and echoing
    /// them back is noise rather than help. The control-character strip is
    /// not affected by the cap and is never optional.
    pub fn clipped_to(s: &str, max: usize) -> Self {
        Echo(sanitize_marked(s, max))
    }

    /// Sanitizes `s` to [`MAX_INLINE_ECHO`], for a value being composed INTO
    /// a message that will occupy one diagnostic arg.
    ///
    /// Use this wherever a `format!` interpolates document-supplied text into
    /// a string handed to a single `.arg(…)`: it is what keeps the prose
    /// explaining the failure inside the arg's own budget.
    pub fn inline(s: &str) -> Self {
        Echo::clipped_to(s, MAX_INLINE_ECHO)
    }

    /// The sanitized text.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Echo {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// Reading an `Echo` as a `&str` is always safe — the only text it can hold
/// is already sanitized — so it derefs like the `String` it replaced. There
/// is no path back to the unsanitized input, which is the property the
/// newtype exists for.
impl std::ops::Deref for Echo {
    type Target = str;

    fn deref(&self) -> &str {
        &self.0
    }
}

impl PartialEq<str> for Echo {
    fn eq(&self, other: &str) -> bool {
        self.0 == other
    }
}

impl PartialEq<&str> for Echo {
    fn eq(&self, other: &&str) -> bool {
        self.0 == *other
    }
}

impl From<&str> for Echo {
    fn from(s: &str) -> Self {
        Echo::new(s)
    }
}

impl From<String> for Echo {
    fn from(s: String) -> Self {
        Echo::new(&s)
    }
}

impl From<&String> for Echo {
    fn from(s: &String) -> Self {
        Echo::new(s)
    }
}

impl From<&Path> for Echo {
    fn from(path: &Path) -> Self {
        Echo::new(&path.display().to_string())
    }
}

#[cfg(test)]
#[path = "echo/tests.rs"]
mod tests;
