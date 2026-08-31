//! Putting a generated table back into its page, between markers.
//!
//! The mechanism mirrors the one that keeps the README gallery honest
//! (`site/src/lib/readme.ts`): a start marker, a generated body, an end
//! marker, and a regenerate/compare pair of make targets around them. It
//! fails LOUDLY on a page whose markers are missing, duplicated or reversed —
//! a splice that silently no-ops is how a generated artifact goes stale while
//! every gate stays green.

use std::fmt;

/// The start marker, minus its table id and trailing `-->`.
///
/// Deliberately NOT the site projection's `<!-- rf:begin -->`: that pair is
/// STRIPPED by `projectedBody()` before the byte-for-byte drift comparison,
/// so a generated table wearing it would vanish from the projected body and
/// red the round-trip gate.
pub const OPEN: &str = "<!-- rf:table:start ";

/// The end marker, in full.
pub const CLOSE: &str = "<!-- rf:table:end -->";

/// Why a splice could not be performed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SpliceError {
    /// The page carries no start marker for this table id.
    NoStart { id: String },
    /// A start marker with no end marker after it.
    NoEnd { id: String },
    /// The id appears more than once, so "between the markers" is ambiguous.
    Duplicated { id: String, count: usize },
    /// The generated body contains a marker, which would end the block early.
    ///
    /// The only hostile input this module has: the body is rendered from
    /// committed prose, and a cell quoting the end marker would otherwise cut
    /// the block short and leave the rest of the page inside it.
    MarkerInBody { id: String },
}

impl fmt::Display for SpliceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoStart { id } => {
                write!(f, "`{id}`: the page carries no `{OPEN}{id} …-->` marker")
            }
            Self::NoEnd { id } => write!(f, "`{id}`: start marker with no `{CLOSE}` after it"),
            Self::Duplicated { id, count } => {
                write!(f, "`{id}`: {count} start markers; the id must be unique")
            }
            Self::MarkerInBody { id } => {
                write!(f, "`{id}`: the rendered table contains a table marker")
            }
        }
    }
}

/// The full start marker for a table id, including the regenerate hint the
/// next reader of the file needs.
#[must_use]
pub fn start_marker(id: &str) -> String {
    format!("{OPEN}{id} (generated — edit the catalog or reference/tables.yml, then `make reference:generate`) -->")
}

/// Replaces the block between `id`'s markers with `body`.
///
/// # Errors
///
/// Every way the page and the generated body can disagree — see
/// [`SpliceError`]. None of them is recoverable by guessing, so each names
/// the table rather than falling back to leaving the page alone.
pub fn splice(page: &str, id: &str, body: &str) -> Result<String, SpliceError> {
    if body.contains(OPEN) || body.contains(CLOSE) {
        return Err(SpliceError::MarkerInBody { id: id.to_owned() });
    }
    let needle = format!("{OPEN}{id} ");
    let count = page.matches(needle.as_str()).count();
    if count == 0 {
        return Err(SpliceError::NoStart { id: id.to_owned() });
    }
    if count > 1 {
        return Err(SpliceError::Duplicated {
            id: id.to_owned(),
            count,
        });
    }
    // `count == 1`, so the find cannot miss.
    let start = page.find(needle.as_str()).unwrap_or_default();
    let Some(open_end) = page[start..].find("-->").map(|i| start + i + 3) else {
        return Err(SpliceError::NoEnd { id: id.to_owned() });
    };
    let Some(close) = page[open_end..].find(CLOSE).map(|i| open_end + i) else {
        return Err(SpliceError::NoEnd { id: id.to_owned() });
    };
    let mut out = String::with_capacity(page.len() + body.len());
    out.push_str(&page[..open_end]);
    out.push('\n');
    out.push_str(body);
    out.push('\n');
    out.push_str(&page[close..]);
    Ok(out)
}
