//! Appending a revision — the incremental update itself.
//!
//! An incremental update never rewrites what is already there: the original
//! bytes stay a byte-identical PREFIX of the result, and everything new is
//! appended after them. That property is the whole basis of signing a PDF —
//! a signature covers the bytes up to its own placeholder, so any edit that
//! moved an earlier byte would invalidate it.
//!
//! What gets appended is the objects the caller added or replaced, a fresh
//! cross-reference section describing exactly those objects, and a trailer
//! whose `/Prev` points back at the previous section. Keys the new trailer
//! must carry (`/Root`, `/Info`, `/ID`) are copied as raw bytes from the
//! original.

use std::collections::BTreeMap;

use crate::document::PdfDocument;
use crate::error::{Result, SigningError};
use crate::limits::{BYTE_RANGE_DIGITS, MAX_FIXED_WIDTH_OFFSET, MAX_OBJECT_NUMBER};

#[cfg(test)]
mod tests;

/// Collects the objects one appended revision will carry.
pub struct RevisionBuilder<'a, 'buf> {
    doc: &'a PdfDocument<'buf>,
    next_number: u32,
    objects: BTreeMap<u32, Vec<u8>>,
}

/// The bytes of an extended document, plus where each new object's body
/// landed — which is what lets a caller patch a placeholder it wrote.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Revision {
    bytes: Vec<u8>,
    bodies: BTreeMap<u32, usize>,
}

impl Revision {
    /// The extended document.
    #[must_use]
    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    /// Consumes the revision, yielding the extended document.
    #[must_use]
    pub fn into_bytes(self) -> Vec<u8> {
        self.bytes
    }

    /// Where object `number`'s body starts in [`Self::bytes`].
    pub(crate) fn body_offset(&self, number: u32) -> Option<usize> {
        self.bodies.get(&number).copied()
    }

    /// Overwrites bytes in place, for patching a fixed-width placeholder.
    pub(crate) fn patch(&mut self, at: usize, value: &[u8]) -> Result<()> {
        let window = self
            .bytes
            .get_mut(at..at.saturating_add(value.len()))
            .ok_or(SigningError::OutOfRange {
                offset: at,
                what: "a placeholder to patch",
            })?;
        window.copy_from_slice(value);
        Ok(())
    }
}

impl<'a, 'buf> RevisionBuilder<'a, 'buf> {
    /// Starts a revision on top of `doc`.
    #[must_use]
    pub fn new(doc: &'a PdfDocument<'buf>) -> Self {
        // Numbering starts above BOTH the trailer's /Size and the highest
        // object number the cross-reference chain actually describes — a
        // hostile document can understate /Size, and trusting it would hand
        // out a number that silently REPLACES an existing object.
        let above_existing = doc
            .offsets
            .keys()
            .next_back()
            .map_or(0, |highest| highest.saturating_add(1));
        Self {
            doc,
            next_number: doc.size.max(above_existing),
            objects: BTreeMap::new(),
        }
    }

    /// Reserves the next unused object number.
    pub fn allocate(&mut self) -> Result<u32> {
        let number = self.next_number;
        if number > MAX_OBJECT_NUMBER {
            return Err(SigningError::OutOfRange {
                offset: 0,
                what: "the next object number",
            });
        }
        self.next_number = number.saturating_add(1);
        Ok(number)
    }

    /// Adds a new object, or replaces an existing one with the same number.
    /// `body` is the object's content between its header and `endobj`.
    pub fn set_object(&mut self, number: u32, body: Vec<u8>) {
        self.objects.insert(number, body);
    }

    /// Writes the appended revision and returns the extended document.
    pub fn finish(self) -> Result<Revision> {
        if self.objects.is_empty() {
            return Err(SigningError::InvalidOption {
                what: "a revision must add or replace at least one object",
            });
        }
        let mut bytes = self.doc.buf.to_vec();
        bytes.push(b'\n');
        let mut headers: BTreeMap<u32, usize> = BTreeMap::new();
        let mut bodies: BTreeMap<u32, usize> = BTreeMap::new();
        for (number, body) in &self.objects {
            headers.insert(*number, bytes.len());
            bytes.extend_from_slice(format!("{number} 0 obj\n").as_bytes());
            bodies.insert(*number, bytes.len());
            bytes.extend_from_slice(body);
            bytes.extend_from_slice(b"\nendobj\n");
        }
        let xref_offset = bytes.len();
        write_xref(&mut bytes, &headers)?;
        self.write_trailer(&mut bytes, xref_offset)?;
        Ok(Revision { bytes, bodies })
    }

    fn write_trailer(&self, out: &mut Vec<u8>, xref_offset: usize) -> Result<()> {
        let highest = self.objects.keys().copied().max().unwrap_or_default();
        let size = highest.saturating_add(1).max(self.doc.size);
        out.extend_from_slice(b"trailer\n<</Size ");
        out.extend_from_slice(size.to_string().as_bytes());
        for key in [b"Root".as_slice(), b"Info".as_slice(), b"ID".as_slice()] {
            if let Some(raw) = self.doc.trailer_value(key) {
                out.push(b'/');
                out.extend_from_slice(key);
                out.push(b' ');
                out.extend_from_slice(raw);
            }
        }
        out.extend_from_slice(b"/Prev ");
        out.extend_from_slice(self.doc.startxref.to_string().as_bytes());
        out.extend_from_slice(b">>\nstartxref\n");
        out.extend_from_slice(fixed_offset(xref_offset, "the cross-reference offset")?.as_bytes());
        out.extend_from_slice(b"\n%%EOF");
        Ok(())
    }
}

/// Writes the cross-reference section for exactly the objects in `headers`,
/// grouped into the contiguous subsections the format requires.
fn write_xref(out: &mut Vec<u8>, headers: &BTreeMap<u32, usize>) -> Result<()> {
    out.extend_from_slice(b"xref\n");
    for (first, offsets) in contiguous_runs(headers) {
        out.extend_from_slice(format!("{first} {}\n", offsets.len()).as_bytes());
        for offset in offsets {
            // Exactly 20 bytes per entry: 10 offset digits, SP, 5 generation
            // digits, SP, the keyword, and a two-byte end-of-line.
            out.extend_from_slice(fixed_offset(offset, "an object's byte offset")?.as_bytes());
            out.extend_from_slice(b" 00000 n\r\n");
        }
    }
    Ok(())
}

/// Groups object numbers into runs of consecutive numbers, each run becoming
/// one `<first> <count>` subsection.
fn contiguous_runs(headers: &BTreeMap<u32, usize>) -> Vec<(u32, Vec<usize>)> {
    let mut runs: Vec<(u32, Vec<usize>)> = Vec::new();
    for (&number, &offset) in headers {
        let extends_last = runs.last().is_some_and(|(first, offsets)| {
            first.saturating_add(u32::try_from(offsets.len()).unwrap_or(u32::MAX)) == number
        });
        match runs.last_mut() {
            Some((_, offsets)) if extends_last => offsets.push(offset),
            _ => runs.push((number, vec![offset])),
        }
    }
    runs
}

/// Formats a byte offset zero-padded to the fixed field width, refusing a
/// file too large for the format's ten digits.
pub(crate) fn fixed_offset(value: usize, what: &'static str) -> Result<String> {
    if value > MAX_FIXED_WIDTH_OFFSET {
        return Err(SigningError::OutOfRange { offset: 0, what });
    }
    let width = BYTE_RANGE_DIGITS;
    Ok(format!("{value:0width$}"))
}
