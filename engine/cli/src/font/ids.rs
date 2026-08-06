//! The id rules `font add` applies, as pure functions.
//!
//! Kept free of the filesystem so every branch — including the hostile
//! ones — is exercised by a direct call rather than by building a broken
//! pack on disk to provoke it.

use shojiku_core::{FontStyle, FontWeight};
use shojiku_formatter::valid_pack_id;

use super::FontPackError;

/// Longest accepted face file name. A pack's files are named by the source
/// file, so this bounds what a caller's filename can push into a manifest.
pub const MAX_FACE_FILE_NAME: usize = 128;

/// Which id a rejection is about, so the message names the flag the caller
/// typed rather than a generic "id".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdKind {
    Family,
    Pack,
    Face,
}

impl IdKind {
    /// The flag that carries this id.
    pub(super) fn flag(self) -> &'static str {
        match self {
            IdKind::Family => "--family",
            IdKind::Pack => "--pack",
            IdKind::Face => "--face-id",
        }
    }
}

/// Checks an id against the pack-id charset.
///
/// Family and face ids take the SAME rule as the pack id even though only
/// the pack id becomes a directory name: they are the flat global namespace
/// a template's `fontFamily` selects from, every bundled family is already
/// spelled this way, and a value carrying control or bidirectional
/// characters would otherwise travel into diagnostics and terminals.
pub fn check_id(id: &str, kind: IdKind) -> Result<(), FontPackError> {
    if valid_pack_id(id) {
        return Ok(());
    }
    Err(FontPackError::InvalidId {
        flag: kind.flag(),
        // Bounded by the id's own domain: past the maximum the value is
        // invalid by definition, so there is nothing further to echo.
        id: shojiku_diagnostics::Echo::clipped_to(id, shojiku_formatter::MAX_PACK_ID),
    })
}

/// The face id for a family and variant when `--face-id` is not given:
/// the family id plus a variant suffix.
///
/// The suffixes match what the Designer's browser-side pack builder mints
/// (`gf-lato`, `gf-lato-bold`, …), so a family installed through either
/// route addresses the same way.
#[must_use]
pub fn default_face_id(family: &str, weight: FontWeight, style: FontStyle) -> String {
    let mut id = String::from(family);
    if weight == FontWeight::Bold {
        id.push_str("-bold");
    }
    if style == FontStyle::Italic {
        id.push_str("-italic");
    }
    id
}

/// The file name a face is stored under inside the pack.
///
/// Taken from the SOURCE file's name, not composed from ids: the manifest's
/// `url:` hint is meant to point at the same artifact, and a renamed file
/// would make the pin describe something the upstream name does not. A
/// source name that is not a plain, safe segment is refused rather than
/// sanitized — silently storing a face under a different name than the
/// caller passed is the kind of surprise a pinned pack cannot afford.
pub fn face_file_name(source: &std::path::Path) -> Result<String, FontPackError> {
    let name = source.file_name().and_then(|n| n.to_str()).ok_or_else(|| {
        FontPackError::UnusableFileName {
            path: shojiku_diagnostics::Echo::from(source),
        }
    })?;
    // A closed charset with no `/`, `\` or leading `.`, so the name can be
    // neither a traversal nor a hidden file however the OS reads it. `..`
    // and `.` fall out of the leading-dot rule.
    let safe = !name.is_empty()
        && !name.starts_with('.')
        && name.len() <= MAX_FACE_FILE_NAME
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'));
    if !safe {
        return Err(FontPackError::UnusableFileName {
            path: shojiku_diagnostics::Echo::from(source),
        });
    }
    Ok(name.to_string())
}

#[cfg(test)]
mod tests;
