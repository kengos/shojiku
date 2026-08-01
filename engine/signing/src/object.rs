//! The shallow dictionary model: keys mapped to the RAW bytes of their
//! values.
//!
//! "Shallow" is the whole point. Appending a revision means re-emitting a
//! dictionary with one key added, and every other key must survive
//! byte-for-byte — so values are borrowed spans of the original file, not
//! decoded objects. Only the handful of values this crate acts on (integers
//! and indirect references) are interpreted at all, and each of those is
//! parsed on demand rather than eagerly.
//!
//! This model is PUBLIC because the verifier reads signed documents through
//! it rather than through a parser of its own. Two parsers over the same
//! bytes could disagree, and a disagreement here means the verifier checks
//! something other than what a reader sees — the exact failure the whole
//! signing design exists to prevent.

use core::ops::Range;

use crate::error::{Result, SigningError};
use crate::lexer::read_token;
use crate::limits::MAX_DICT_ENTRIES;

mod scan;
#[cfg(test)]
mod tests;

pub(crate) use scan::scan_value;

/// An indirect reference: an object number and its generation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ObjRef {
    /// The object number.
    pub number: u32,
    /// The generation number. Every document this release reads carries 0
    /// (see [`crate::PdfDocument::body_start`]).
    pub generation: u16,
}

/// A dictionary as key/raw-value pairs, in the order the file wrote them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Dict<'a> {
    pub(crate) entries: Vec<(&'a [u8], &'a [u8])>,
}

impl<'a> Dict<'a> {
    /// Parses the dictionary at or after `pos`.
    ///
    /// # Errors
    ///
    /// Returns [`SigningError`] when `pos` does not begin a readable
    /// dictionary, or when one of the limits in `crate::limits` is hit.
    pub fn parse(buf: &'a [u8], pos: usize) -> Result<Self> {
        let mut entries: Vec<(&[u8], &[u8])> = Vec::new();
        scan::walk_dict(buf, pos, 0, &mut |ks, ke, vs, ve| {
            if entries.len() >= MAX_DICT_ENTRIES {
                return Err(SigningError::LimitExceeded {
                    what: "dictionary entries",
                    cap: MAX_DICT_ENTRIES,
                });
            }
            entries.push((
                buf.get(ks..ke).unwrap_or_default(),
                buf.get(vs..ve).unwrap_or_default(),
            ));
            Ok(())
        })?;
        Ok(Self { entries })
    }

    /// The raw value of `key`, or `None` when the key is absent. The FIRST
    /// occurrence wins, matching how a reader resolves a duplicated key.
    #[must_use]
    pub fn get(&self, key: &[u8]) -> Option<&'a [u8]> {
        self.entries
            .iter()
            .find(|(k, _)| *k == key)
            .map(|(_, v)| *v)
    }

    /// Whether `key` is present, whatever its value.
    #[must_use]
    pub fn has(&self, key: &[u8]) -> bool {
        self.entries.iter().any(|(k, _)| *k == key)
    }

    /// Reads `key` as an unsigned integer.
    ///
    /// # Errors
    ///
    /// Returns [`SigningError`] when the value is present but is not a plain
    /// unsigned integer; `what` names what was being read.
    pub fn get_uint(&self, key: &[u8], what: &'static str) -> Result<Option<u64>> {
        match self.get(key) {
            None => Ok(None),
            Some(raw) => parse_uint(raw, what).map(Some),
        }
    }

    /// Reads `key` as an indirect reference.
    ///
    /// # Errors
    ///
    /// Returns [`SigningError`] when the value is present but is not
    /// `<number> <generation> R`; `what` names what was being read.
    pub fn get_ref(&self, key: &[u8], what: &'static str) -> Result<Option<ObjRef>> {
        match self.get(key) {
            None => Ok(None),
            Some(raw) => parse_ref(raw, what).map(Some),
        }
    }
}

/// The byte range of `key`'s value inside the dictionary starting at
/// `dict_at`.
///
/// [`Dict`] borrows its values as slices, which is everything a rewrite
/// needs — but a verifier has to say WHERE a value sits, because the signed
/// byte ranges are defined by the position of the `/Contents` window and by
/// nothing else. Recovering an offset from a borrowed slice would mean
/// pointer arithmetic; the dictionary walk already carries the offsets, so
/// this asks it for them instead.
///
/// # Errors
///
/// Returns [`SigningError`] when `dict_at` does not begin a readable
/// dictionary.
pub fn dict_value_span(buf: &[u8], dict_at: usize, key: &[u8]) -> Result<Option<Range<usize>>> {
    let mut found: Option<Range<usize>> = None;
    scan::walk_dict(buf, dict_at, 0, &mut |ks, ke, vs, ve| {
        // First occurrence wins, matching `Dict::get` and how a reader
        // resolves a duplicated key.
        if found.is_none() && buf.get(ks..ke) == Some(key) {
            found = Some(vs..ve);
        }
        Ok(())
    })?;
    Ok(found)
}

/// Parses a raw value span as an unsigned integer.
///
/// # Errors
///
/// Returns [`SigningError`] when the span is not exactly one unsigned
/// decimal integer; `what` names what was being read.
pub fn parse_uint(raw: &[u8], what: &'static str) -> Result<u64> {
    crate::lexer::read_uint(raw, 0, what).and_then(|(value, end)| {
        let rest = crate::lexer::skip_ws(raw, end);
        if rest == raw.len() {
            Ok(value)
        } else {
            Err(SigningError::Malformed { offset: rest, what })
        }
    })
}

/// Parses a raw value span as `<number> <generation> R`.
///
/// # Errors
///
/// Returns [`SigningError`] when the span is not an indirect reference;
/// `what` names what was being read.
pub fn parse_ref(raw: &[u8], what: &'static str) -> Result<ObjRef> {
    let (number, after_number) = crate::lexer::read_uint(raw, 0, what)?;
    let (generation, after_generation) = crate::lexer::read_uint(raw, after_number, what)?;
    let keyword_at = crate::lexer::skip_ws(raw, after_generation);
    if read_token(raw, keyword_at).0 != b"R" {
        return Err(SigningError::Malformed {
            offset: keyword_at,
            what,
        });
    }
    Ok(ObjRef {
        number: object_number(number, what)?,
        generation: u16::try_from(generation).map_err(|_| SigningError::OutOfRange {
            offset: after_number,
            what,
        })?,
    })
}

/// Narrows a parsed number to a usable object number.
pub(crate) fn object_number(value: u64, what: &'static str) -> Result<u32> {
    let number = u32::try_from(value).map_err(|_| SigningError::OutOfRange { offset: 0, what })?;
    if number > crate::limits::MAX_OBJECT_NUMBER {
        return Err(SigningError::OutOfRange { offset: 0, what });
    }
    Ok(number)
}

/// Splits an array's raw span into the raw spans of its elements.
///
/// # Errors
///
/// Returns [`SigningError`] when the span does not open with `[`, or when an
/// element cannot be scanned; `what` names what was being read.
pub fn array_elements<'a>(raw: &'a [u8], what: &'static str) -> Result<Vec<&'a [u8]>> {
    if raw.first() != Some(&b'[') {
        return Err(SigningError::Malformed { offset: 0, what });
    }
    let mut out = Vec::new();
    let mut cursor = 1usize;
    loop {
        cursor = crate::lexer::skip_ws(raw, cursor);
        match raw.get(cursor) {
            Some(b']') | None => return Ok(out),
            Some(_) => {
                let (start, end) = scan_value(raw, cursor, 0)?;
                out.push(raw.get(start..end).unwrap_or_default());
                cursor = end;
            }
        }
    }
}
