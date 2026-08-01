//! The classic cross-reference table: subsection headers and their entries.
//!
//! This release reads cross-reference TABLES only. A document whose
//! `startxref` points at a cross-reference stream — or that carries the
//! hybrid-file `/XRefStm` marker — is rejected by name rather than parsed on
//! a best-effort basis, because guessing at a structure the writer cannot
//! reproduce is how a signature ends up covering something other than what a
//! reader sees. The bound is deliberate and documented; documents this engine
//! renders are always tables.

use crate::error::{Result, SigningError};
use crate::lexer::{expect_keyword, offset_within, read_token, read_uint, skip_ws};
use crate::limits::MAX_XREF_ENTRIES;
use crate::object::{object_number, Dict};

#[cfg(test)]
mod tests;

/// One cross-reference section: its in-use entries and its trailer.
#[derive(Debug)]
pub(crate) struct XrefSection<'a> {
    /// `(object number, byte offset)` for every in-use entry, in file order.
    pub(crate) entries: Vec<(u32, usize)>,
    /// The trailer dictionary that follows the table.
    pub(crate) trailer: Dict<'a>,
}

/// Parses the cross-reference section at `offset`.
///
/// `budget` is the number of entries the whole document may still spend, so a
/// `/Prev` chain of sections cannot add up to an unbounded allocation.
pub(crate) fn parse_section<'a>(
    buf: &'a [u8],
    offset: usize,
    budget: &mut usize,
) -> Result<XrefSection<'a>> {
    let start = skip_ws(buf, offset);
    if read_token(buf, start).0 != b"xref" {
        return Err(SigningError::Unsupported {
            what: "a cross-reference stream (this release reads classic cross-reference tables)",
        });
    }
    let mut cursor = start + 4;
    let mut entries = Vec::new();
    loop {
        let at = skip_ws(buf, cursor);
        if read_token(buf, at).0 == b"trailer" {
            cursor = at;
            break;
        }
        cursor = parse_subsection(buf, at, budget, &mut entries)?;
    }
    let after_keyword = expect_keyword(buf, cursor, b"trailer", "the trailer keyword")?;
    let trailer = Dict::parse(buf, after_keyword)?;
    Ok(XrefSection { entries, trailer })
}

/// Parses one `<first> <count>` subsection and its entries.
fn parse_subsection(
    buf: &[u8],
    at: usize,
    budget: &mut usize,
    entries: &mut Vec<(u32, usize)>,
) -> Result<usize> {
    let (first, after_first) = read_uint(buf, at, "a subsection's first object number")?;
    let (count, mut cursor) = read_uint(buf, after_first, "a subsection's entry count")?;
    if count > *budget as u64 {
        return Err(SigningError::LimitExceeded {
            what: "cross-reference entries",
            cap: MAX_XREF_ENTRIES,
        });
    }
    for index in 0..count {
        let number = first.checked_add(index).ok_or(SigningError::OutOfRange {
            offset: at,
            what: "an entry's object number",
        })?;
        let (offset, after_offset) = read_uint(buf, cursor, "an entry's byte offset")?;
        let (generation, after_generation) = read_uint(buf, after_offset, "an entry's generation")?;
        let kind_at = skip_ws(buf, after_generation);
        let (kind, after_kind) = read_token(buf, kind_at);
        match kind {
            // An in-use entry's offset is checked against the real buffer
            // HERE rather than when the object is resolved: an entry pointing
            // past the end of the file is a broken table, and saying so at
            // the table is more useful than a failure three calls later.
            //
            // The generation is checked here too, and only for in-use
            // entries — a FREE entry conventionally carries 65535 and is
            // never resolved. Requiring zero is what lets object resolution
            // match on the number alone; the reasoning is on
            // `PdfDocument::body_start`.
            b"n" => {
                if generation != 0 {
                    return Err(SigningError::Unsupported {
                        what: "a cross-reference entry with a non-zero generation number",
                    });
                }
                entries.push((
                    object_number(number, "an entry's object number")?,
                    offset_within(buf, offset, kind_at, "an entry's byte offset")?,
                ));
            }
            b"f" => {}
            _ => {
                return Err(SigningError::Malformed {
                    offset: kind_at,
                    what: "an entry keyword (n or f)",
                })
            }
        }
        *budget -= 1;
        cursor = after_kind;
    }
    Ok(cursor)
}
