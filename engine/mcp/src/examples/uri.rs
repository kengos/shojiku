//! The `shojiku://example/…` URI grammar: parsing a client-supplied string
//! into an entry or file reference, and formatting the two forms back.
//!
//! The grammar is deliberately narrow. A reference NEVER becomes a
//! filesystem path — it indexes the compile-time table in `super::embed` —
//! but the charset is still restricted here so a hostile URI is refused at
//! the edge rather than merely failing to match an id: `.` and `..`
//! segments are rejected outright, and `%` is outside the accepted set, so
//! percent-encoded traversal cannot be smuggled past a decoder this module
//! deliberately does not have.

/// The one scheme+authority prefix every example reference carries.
pub(crate) const PREFIX: &str = "shojiku://example/";

/// What a well-formed reference points at.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Ref<'a> {
    /// A whole entry: every source file it carries.
    Entry(&'a str),
    /// One named source file inside an entry.
    File(&'a str, &'a str),
}

/// Parses a client-supplied URI. `None` = malformed (the caller answers
/// with invalid-params); a well-formed reference that names nothing is a
/// separate, later "not found".
pub(crate) fn parse(uri: &str) -> Option<Ref<'_>> {
    let rest = uri.strip_prefix(PREFIX)?;
    let mut parts = rest.split('/');
    let bucket = segment(parts.next()?)?;
    let name = segment(parts.next()?)?;
    let file = parts.next();
    if parts.next().is_some() {
        return None; // deeper than any real reference goes
    }
    let id = &rest[..bucket.len() + 1 + name.len()];
    match file {
        None => Some(Ref::Entry(id)),
        Some(file) => Some(Ref::File(id, segment(file)?)),
    }
}

/// Accepts one path segment: non-empty, `[A-Za-z0-9._-]` only, and never a
/// relative-path element. The charset is what keeps control bytes, NUL,
/// `%`-escapes and separators out.
fn segment(part: &str) -> Option<&str> {
    if part.is_empty() || part == "." || part == ".." {
        return None;
    }
    part.chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        .then_some(part)
}

/// The canonical URI for a whole entry.
pub(crate) fn entry_uri(id: &str) -> String {
    format!("{PREFIX}{id}")
}

/// The canonical URI for one file inside an entry.
pub(crate) fn file_uri(id: &str, file: &str) -> String {
    format!("{PREFIX}{id}/{file}")
}

#[cfg(test)]
mod tests;
