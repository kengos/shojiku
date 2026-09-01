//! The `shojiku://reference/<page>[#<fragment>]` grammar: parsing a
//! client-supplied string into a page reference, and formatting the two
//! forms back.
//!
//! The grammar is as narrow as the example one, for the same reason. A
//! reference NEVER becomes a filesystem path — it indexes the compile-time
//! table in `super::embed` — but the charset is still restricted here so a
//! hostile URI is refused at the EDGE rather than merely failing to match a
//! stem: `.` and `..` are rejected outright, `/` is outside the accepted
//! set so a path cannot be deepened, and `%` is outside it too, so
//! percent-encoded traversal cannot be smuggled past a decoder this module
//! deliberately does not have.
//!
//! The fragment is additionally LENGTH-bounded. The stem is not: it is one
//! segment of a closed charset and an over-long one simply names no page,
//! whereas a fragment is matched against node names and a bound keeps that
//! search over a bounded string.

/// The one scheme+authority prefix every reference URI carries.
pub(crate) const PREFIX: &str = "shojiku://reference/";

/// Longest accepted fragment. The longest selector the catalog can actually
/// be asked for is a `<Shape>.<prop>` pair at 30 characters — measured, and
/// held against this bound by `super::tests` — so the cap is headroom over
/// the real address space, not a limit anything authored runs into.
pub(crate) const MAX_FRAGMENT: usize = 64;

/// What a well-formed reference points at.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Ref<'a> {
    /// The page's file stem.
    pub(crate) stem: &'a str,
    /// The node selector, when the URI carries one.
    pub(crate) fragment: Option<&'a str>,
}

/// Parses a client-supplied URI. `None` = malformed (the caller answers
/// with invalid-params); a well-formed reference that names nothing is a
/// separate, later "not found".
pub(crate) fn parse(uri: &str) -> Option<Ref<'_>> {
    let rest = uri.strip_prefix(PREFIX)?;
    let mut halves = rest.splitn(2, '#');
    let stem = segment(halves.next()?)?;
    let fragment = match halves.next() {
        None => None,
        // A second `#` is not a fragment inside a fragment; it is a URI
        // shape we do not define, so it is refused rather than guessed at.
        Some(f) if f.contains('#') => return None,
        Some(f) => Some(selector(f)?),
    };
    Some(Ref { stem, fragment })
}

/// Accepts a page stem: non-empty, `[A-Za-z0-9._-]` only, and never a
/// relative-path element. The charset is what keeps control bytes, NUL,
/// `%`-escapes and separators out.
fn segment(part: &str) -> Option<&str> {
    if part.is_empty() || part == "." || part == ".." {
        return None;
    }
    part.chars().all(is_accepted).then_some(part)
}

/// Accepts a fragment: a stem-shaped selector, additionally bounded at
/// [`MAX_FRAGMENT`] characters.
fn selector(part: &str) -> Option<&str> {
    segment(part).filter(|f| f.chars().count() <= MAX_FRAGMENT)
}

/// The closed charset both halves are drawn from.
fn is_accepted(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')
}

/// The canonical URI for a whole page.
pub(crate) fn page_uri(stem: &str) -> String {
    format!("{PREFIX}{stem}")
}

/// The canonical URI for one node selector inside a page.
pub(crate) fn fragment_uri(stem: &str, fragment: &str) -> String {
    format!("{PREFIX}{stem}#{fragment}")
}

#[cfg(test)]
mod tests;
