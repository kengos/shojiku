//! Scanning one PDF object as a RAW BYTE SPAN.
//!
//! The crate never builds a value model: it records where each value starts
//! and ends and copies those bytes verbatim when it rewrites the dictionary
//! that held them. That is what lets an appended revision carry `/ID`, the
//! catalog's own keys and a page's existing entries through byte-for-byte,
//! without this crate having to understand — or risk re-encoding — them.
//!
//! Scanning is structural, so strings are walked by their own rules rather
//! than by counting brackets: a `(…)` literal containing `>>` must not end
//! the dictionary around it.

use crate::error::{Result, SigningError};
use crate::lexer::{is_regular, read_token, skip_ws};
use crate::limits::MAX_NESTING_DEPTH;

/// Scans the single object starting at or after `pos`, returning its byte
/// span as `(start, end)`.
pub(crate) fn scan_value(buf: &[u8], pos: usize, depth: usize) -> Result<(usize, usize)> {
    if depth > MAX_NESTING_DEPTH {
        return Err(SigningError::LimitExceeded {
            what: "dictionary/array nesting",
            cap: MAX_NESTING_DEPTH,
        });
    }
    let start = skip_ws(buf, pos);
    let first = *buf.get(start).ok_or(SigningError::Malformed {
        offset: start,
        what: "a value, but the file ends here",
    })?;
    let end = match first {
        b'<' if buf.get(start + 1) == Some(&b'<') => scan_dict_span(buf, start, depth)?,
        b'<' => scan_hex_string(buf, start)?,
        b'[' => scan_array(buf, start, depth)?,
        b'(' => scan_literal_string(buf, start)?,
        b'/' => read_token(buf, start + 1).1,
        b'0'..=b'9' | b'+' | b'-' | b'.' => scan_numeric(buf, start),
        _ => scan_bare_keyword(buf, start)?,
    };
    Ok((start, end))
}

/// Walks a dictionary, calling `on_entry` with each key (without its leading
/// slash) and value span. Returns the position after the closing `>>`.
pub(crate) fn walk_dict(
    buf: &[u8],
    pos: usize,
    depth: usize,
    on_entry: &mut dyn FnMut(usize, usize, usize, usize) -> Result<()>,
) -> Result<usize> {
    let open = skip_ws(buf, pos);
    if buf.get(open..open.saturating_add(2)) != Some(b"<<") {
        return Err(SigningError::Malformed {
            offset: open,
            what: "a dictionary",
        });
    }
    let mut cursor = open + 2;
    loop {
        cursor = skip_ws(buf, cursor);
        if buf.get(cursor..cursor.saturating_add(2)) == Some(b">>".as_slice()) {
            return Ok(cursor + 2);
        }
        if buf.get(cursor) != Some(&b'/') {
            return Err(SigningError::Malformed {
                offset: cursor,
                what: "a key name or the end of the dictionary",
            });
        }
        let (key_start, key_end) = (cursor + 1, read_token(buf, cursor + 1).1);
        let (value_start, value_end) = scan_value(buf, key_end, depth + 1)?;
        on_entry(key_start, key_end, value_start, value_end)?;
        cursor = value_end;
    }
}

fn scan_dict_span(buf: &[u8], start: usize, depth: usize) -> Result<usize> {
    walk_dict(buf, start, depth, &mut |_, _, _, _| Ok(()))
}

/// Walks an array. Depth is guarded by [`scan_value`], which every element
/// goes through, so there is no second check here.
fn scan_array(buf: &[u8], start: usize, depth: usize) -> Result<usize> {
    let mut cursor = start + 1;
    loop {
        cursor = skip_ws(buf, cursor);
        match buf.get(cursor) {
            Some(b']') => return Ok(cursor + 1),
            None => {
                return Err(SigningError::Malformed {
                    offset: cursor,
                    what: "the end of an array",
                })
            }
            Some(_) => cursor = scan_value(buf, cursor, depth + 1)?.1,
        }
    }
}

fn scan_hex_string(buf: &[u8], start: usize) -> Result<usize> {
    let mut cursor = start + 1;
    while let Some(&b) = buf.get(cursor) {
        cursor += 1;
        if b == b'>' {
            return Ok(cursor);
        }
    }
    Err(SigningError::Malformed {
        offset: cursor,
        what: "the end of a hexadecimal string",
    })
}

fn scan_literal_string(buf: &[u8], start: usize) -> Result<usize> {
    let mut cursor = start + 1;
    let mut nesting = 1usize;
    while let Some(&b) = buf.get(cursor) {
        cursor += 1;
        match b {
            b'\\' => cursor = cursor.saturating_add(1),
            b'(' => nesting += 1,
            b')' => {
                nesting -= 1;
                if nesting == 0 {
                    return Ok(cursor);
                }
            }
            _ => {}
        }
    }
    Err(SigningError::Malformed {
        offset: cursor,
        what: "the end of a literal string",
    })
}

/// Scans a number, extending across `<int> <int> R` when the bytes spell an
/// indirect reference — three tokens that are ONE value to the dictionary
/// around them, so a scanner that stopped at the first number would read `0`
/// as the next key.
fn scan_numeric(buf: &[u8], start: usize) -> usize {
    let after_first = read_token(buf, start).1;
    let second_start = skip_ws(buf, after_first);
    let (second, after_second) = read_token(buf, second_start);
    if second.is_empty() || !second.iter().all(u8::is_ascii_digit) {
        return after_first;
    }
    let third_start = skip_ws(buf, after_second);
    let (third, after_third) = read_token(buf, third_start);
    if third == b"R" {
        after_third
    } else {
        after_first
    }
}

fn scan_bare_keyword(buf: &[u8], start: usize) -> Result<usize> {
    if buf.get(start).is_some_and(|&b| is_regular(b)) {
        Ok(read_token(buf, start).1)
    } else {
        Err(SigningError::Malformed {
            offset: start,
            what: "a value",
        })
    }
}
