//! Reading an existing document far enough to extend it.
//!
//! The reader stops at the structure an appended revision actually needs: the
//! tail, the cross-reference chain, and the dictionaries of the catalog and
//! the first page. Nothing else is decoded — no content streams, no fonts, no
//! images — which is both why this crate is small and why its trust surface
//! stays reviewable.
//!
//! Every rejection names what was unsupported. A document that cannot be read
//! this way is refused outright rather than signed on a best-effort basis:
//! signing a structure the writer misunderstood would produce a signature
//! that covers something other than what a reader sees.

use std::collections::BTreeMap;

use crate::error::{Result, SigningError};
use crate::lexer::{expect_keyword, offset_within, read_uint};
use crate::limits::{MAX_XREF_CHAIN, MAX_XREF_ENTRIES, TAIL_SCAN_WINDOW};
use crate::object::{object_number, Dict, ObjRef};
use crate::xref;

mod pages;
#[cfg(test)]
mod tests;

pub(crate) use pages::first_page;

/// A parsed document: enough of one to append a revision to it.
#[derive(Debug)]
pub struct PdfDocument<'a> {
    pub(crate) buf: &'a [u8],
    pub(crate) offsets: BTreeMap<u32, usize>,
    pub(crate) trailer: Dict<'a>,
    pub(crate) startxref: usize,
    pub(crate) size: u32,
    pub(crate) root: ObjRef,
}

impl<'a> PdfDocument<'a> {
    /// Parses `buf` as a PDF this crate can extend.
    pub fn parse(buf: &'a [u8]) -> Result<Self> {
        check_header(buf)?;
        let startxref = find_startxref(buf)?;
        let (offsets, trailer) = read_chain(buf, startxref)?;
        let size = trailer
            .get_uint(b"Size", "the trailer's /Size")?
            .ok_or(SigningError::Malformed {
                offset: 0,
                what: "a trailer /Size entry",
            })
            .and_then(|value| object_number(value, "the trailer's /Size"))?;
        let root =
            trailer
                .get_ref(b"Root", "the trailer's /Root")?
                .ok_or(SigningError::Malformed {
                    offset: 0,
                    what: "a trailer /Root entry",
                })?;
        let doc = Self {
            buf,
            offsets,
            trailer,
            startxref,
            size,
            root,
        };
        // Resolving the catalog here means a document whose /Root dangles is
        // refused by `parse`, not midway through building a revision.
        doc.dict_at(doc.root.number)?;
        Ok(doc)
    }

    /// The number of the catalog object.
    #[must_use]
    pub fn catalog_number(&self) -> u32 {
        self.root.number
    }

    /// The raw value of a trailer key, for carrying it into the new trailer.
    pub(crate) fn trailer_value(&self, key: &[u8]) -> Option<&'a [u8]> {
        self.trailer.get(key)
    }

    /// The position at which object `number`'s body starts.
    ///
    /// Two things are checked here rather than assumed, because the same
    /// resolution runs over attacker-chosen bytes in the verifier. The
    /// header must NAME the number the cross-reference table claimed — that
    /// is what catches an entry aimed into the middle of another object —
    /// and its generation must be zero.
    ///
    /// Requiring generation zero is what makes matching on the number alone
    /// sufficient. Objects are identified by `(number, generation)`, so a
    /// document whose table and header disagree about the generation could
    /// otherwise resolve differently for a reader than for us, and a
    /// signature would then cover something other than what is displayed.
    /// Every document in scope is generation zero throughout — this engine's
    /// output and the revisions this crate appends both are — so the pair
    /// collapses to the number and the discrepancy cannot arise.
    ///
    /// # Errors
    ///
    /// Returns [`SigningError`] when no entry names `number`, when the
    /// header disagrees with the table, or when the generation is not zero.
    pub fn body_start(&self, number: u32) -> Result<usize> {
        let offset = *self.offsets.get(&number).ok_or(SigningError::Malformed {
            offset: 0,
            what: "a cross-reference entry for a referenced object",
        })?;
        let (found, after_number) = read_uint(self.buf, offset, "an object header's number")?;
        if found != u64::from(number) {
            return Err(SigningError::Malformed {
                offset,
                what: "the object header the cross-reference table points at",
            });
        }
        let (generation, after_generation) =
            read_uint(self.buf, after_number, "an object header's generation")?;
        if generation != 0 {
            return Err(SigningError::Unsupported {
                what: "an object header with a non-zero generation number",
            });
        }
        expect_keyword(self.buf, after_generation, b"obj", "the obj keyword")
    }

    /// Parses object `number` as a dictionary.
    ///
    /// # Errors
    ///
    /// Returns [`SigningError`] when the object cannot be located (see
    /// [`Self::body_start`]) or does not hold a dictionary.
    pub fn dict_at(&self, number: u32) -> Result<Dict<'a>> {
        Dict::parse(self.buf, self.body_start(number)?)
    }
}

/// Rejects anything that is not a `%PDF-<major>.<minor>` file.
fn check_header(buf: &[u8]) -> Result<()> {
    let header = buf.get(0..8).ok_or(SigningError::NotAPdf)?;
    let versioned = header.starts_with(b"%PDF-")
        && header.get(5).is_some_and(u8::is_ascii_digit)
        && header.get(6) == Some(&b'.')
        && header.get(7).is_some_and(u8::is_ascii_digit);
    if versioned {
        Ok(())
    } else {
        Err(SigningError::NotAPdf)
    }
}

/// Finds the `startxref` offset in the file's tail.
fn find_startxref(buf: &[u8]) -> Result<usize> {
    let window_start = buf.len().saturating_sub(TAIL_SCAN_WINDOW);
    let window = buf.get(window_start..).unwrap_or_default();
    let keyword = b"startxref";
    let found = window
        .windows(keyword.len())
        .rposition(|slice| slice == keyword)
        .ok_or(SigningError::Malformed {
            offset: window_start,
            what: "a startxref keyword in the file's tail",
        })?;
    let at = window_start + found + keyword.len();
    let (value, _) = read_uint(buf, at, "the startxref offset")?;
    offset_within(buf, value, at, "the startxref offset")
}

/// Follows the `/Prev` chain, merging every section's entries.
///
/// Sections are read newest-first, so the first offset recorded for an object
/// number is the live one; a later section in the chain describes an older
/// revision and must not overwrite it.
fn read_chain(buf: &[u8], startxref: usize) -> Result<(BTreeMap<u32, usize>, Dict<'_>)> {
    let mut offsets: BTreeMap<u32, usize> = BTreeMap::new();
    let mut budget = MAX_XREF_ENTRIES;
    let mut visited: Vec<usize> = Vec::new();
    let mut newest: Option<Dict<'_>> = None;
    let mut next = Some(startxref);
    while let Some(offset) = next {
        if visited.len() >= MAX_XREF_CHAIN {
            return Err(SigningError::LimitExceeded {
                what: "cross-reference sections in the /Prev chain",
                cap: MAX_XREF_CHAIN,
            });
        }
        if visited.contains(&offset) {
            return Err(SigningError::Malformed {
                offset,
                what: "a cross-reference chain that points back at itself",
            });
        }
        visited.push(offset);
        let section = xref::parse_section(buf, offset, &mut budget)?;
        reject_unsupported(&section.trailer)?;
        for (number, at) in section.entries {
            offsets.entry(number).or_insert(at);
        }
        next = match section.trailer.get_uint(b"Prev", "the trailer's /Prev")? {
            Some(value) => Some(offset_within(buf, value, offset, "the trailer's /Prev")?),
            None => None,
        };
        if newest.is_none() {
            newest = Some(section.trailer);
        }
    }
    let trailer = newest.ok_or(SigningError::Malformed {
        offset: startxref,
        what: "a cross-reference section",
    })?;
    Ok((offsets, trailer))
}

/// Refuses the structures this release does not read, by name.
fn reject_unsupported(trailer: &Dict<'_>) -> Result<()> {
    if trailer.has(b"Encrypt") {
        return Err(SigningError::Unsupported {
            what: "an encrypted document (/Encrypt)",
        });
    }
    if trailer.has(b"XRefStm") {
        return Err(SigningError::Unsupported {
            what:
                "a hybrid-reference file (/XRefStm), whose object streams this release cannot read",
        });
    }
    Ok(())
}
