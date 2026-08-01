//! Byte-level scanning primitives shared by every parser in the crate.
//!
//! The crate-wide posture these primitives model — and every scanner that
//! advances its own cursor (the object scanner) must match — is: untrusted
//! bytes are reached through `get`, never indexed directly; every integer
//! accumulates through checked arithmetic; a cursor may run to the end of
//! the buffer but never past it. Character classes follow the PDF syntax
//! rules for white-space and delimiter bytes.

use crate::error::{Result, SigningError};
use crate::limits::MAX_INT_DIGITS;

#[cfg(test)]
mod tests;

/// PDF white-space bytes: NUL, TAB, LF, FF, CR and SPACE.
pub(crate) fn is_whitespace(b: u8) -> bool {
    matches!(b, 0x00 | 0x09 | 0x0a | 0x0c | 0x0d | 0x20)
}

/// PDF delimiter bytes, which end a regular-character run.
pub(crate) fn is_delimiter(b: u8) -> bool {
    matches!(
        b,
        b'(' | b')' | b'<' | b'>' | b'[' | b']' | b'{' | b'}' | b'/' | b'%'
    )
}

/// A regular character is anything that is neither white-space nor delimiter.
pub(crate) fn is_regular(b: u8) -> bool {
    !is_whitespace(b) && !is_delimiter(b)
}

/// Advances past white-space and `%` comments, stopping at end of buffer.
pub(crate) fn skip_ws(buf: &[u8], mut pos: usize) -> usize {
    while let Some(&b) = buf.get(pos) {
        if is_whitespace(b) {
            pos += 1;
        } else if b == b'%' {
            pos += 1;
            while let Some(&c) = buf.get(pos) {
                if c == b'\n' || c == b'\r' {
                    break;
                }
                pos += 1;
            }
        } else {
            break;
        }
    }
    pos
}

/// Returns the run of regular characters starting at `pos`, and the position
/// after it. An empty run means the cursor is at a delimiter or the end.
pub(crate) fn read_token(buf: &[u8], pos: usize) -> (&[u8], usize) {
    let mut end = pos;
    while buf.get(end).is_some_and(|&b| is_regular(b)) {
        end += 1;
    }
    (buf.get(pos..end).unwrap_or_default(), end)
}

/// Consumes `keyword` at `pos` after white-space, or reports `what` as
/// missing at that offset.
pub(crate) fn expect_keyword(
    buf: &[u8],
    pos: usize,
    keyword: &[u8],
    what: &'static str,
) -> Result<usize> {
    let start = skip_ws(buf, pos);
    let end = start.saturating_add(keyword.len());
    if buf.get(start..end) == Some(keyword) {
        Ok(end)
    } else {
        Err(SigningError::Malformed {
            offset: start,
            what,
        })
    }
}

/// Reads an unsigned decimal integer after white-space.
///
/// The digit run is capped and the accumulation is checked, so neither a
/// pathologically long run nor a value past [`u64::MAX`] can wrap: both
/// surface as errors naming `what`.
pub(crate) fn read_uint(buf: &[u8], pos: usize, what: &'static str) -> Result<(u64, usize)> {
    let start = skip_ws(buf, pos);
    let mut cursor = start;
    let mut value: u64 = 0;
    let mut digits = 0usize;
    while let Some(&b) = buf.get(cursor) {
        if !b.is_ascii_digit() {
            break;
        }
        digits += 1;
        if digits > MAX_INT_DIGITS {
            return Err(SigningError::OutOfRange {
                offset: start,
                what,
            });
        }
        value = value
            .checked_mul(10)
            .and_then(|v| v.checked_add(u64::from(b - b'0')))
            .ok_or(SigningError::OutOfRange {
                offset: start,
                what,
            })?;
        cursor += 1;
    }
    if digits == 0 {
        return Err(SigningError::Malformed {
            offset: start,
            what,
        });
    }
    Ok((value, cursor))
}

/// Narrows a parsed offset to a position that actually exists in `buf`.
///
/// The comparison happens in `u64` so that a value past the address space is
/// rejected by the same branch as a value past the buffer, rather than by a
/// cast whose behaviour would depend on the target's pointer width.
pub(crate) fn offset_within(
    buf: &[u8],
    value: u64,
    at: usize,
    what: &'static str,
) -> Result<usize> {
    if value >= buf.len() as u64 {
        return Err(SigningError::OutOfRange { offset: at, what });
    }
    Ok(value as usize)
}
