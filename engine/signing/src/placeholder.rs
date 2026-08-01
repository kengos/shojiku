//! Reserving the window a signature will later occupy.
//!
//! This is the stage that makes signing possible without cryptography being
//! present yet: it appends a revision holding an empty signature dictionary,
//! computes which bytes of the resulting file the signature will cover, and
//! hands back both the file and those ranges. A signer fills the reserved
//! window; nothing else about the document moves.
//!
//! The byte ranges follow the format's rule exactly — they span the whole
//! file EXCEPT the `/Contents` string, and the excluded gap includes that
//! string's `<` and `>` delimiters. Anything the ranges leave out is
//! unsigned, so "cover everything but the hole" is a correctness property,
//! not a formatting preference.

use core::ops::Range;

use crate::document::{first_page, PdfDocument};
use crate::error::{Result, SigningError};
use crate::limits::{DEFAULT_CONTENTS_CAPACITY, MAX_CONTENTS_CAPACITY, MIN_CONTENTS_CAPACITY};
use crate::revision::{fixed_offset, RevisionBuilder};

mod objects;
#[cfg(test)]
mod tests;

/// How the placeholder is shaped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlaceholderOptions {
    contents_capacity: usize,
}

impl Default for PlaceholderOptions {
    fn default() -> Self {
        Self {
            contents_capacity: DEFAULT_CONTENTS_CAPACITY,
        }
    }
}

impl PlaceholderOptions {
    /// Reserves `bytes` for the signature, which must lie between
    /// [`MIN_CONTENTS_CAPACITY`] and [`MAX_CONTENTS_CAPACITY`].
    ///
    /// The window cannot be resized later without moving every byte after it,
    /// so a caller that knows its signature size states it here.
    pub fn with_contents_capacity(bytes: usize) -> Result<Self> {
        if !(MIN_CONTENTS_CAPACITY..=MAX_CONTENTS_CAPACITY).contains(&bytes) {
            return Err(SigningError::InvalidOption {
                what: "the reserved signature capacity is outside the supported range",
            });
        }
        Ok(Self {
            contents_capacity: bytes,
        })
    }

    /// The reserved capacity, in bytes.
    #[must_use]
    pub fn contents_capacity(&self) -> usize {
        self.contents_capacity
    }
}

/// A document with a signature window reserved in it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedPdf {
    bytes: Vec<u8>,
    byte_range: [usize; 4],
    contents: Range<usize>,
}

impl PreparedPdf {
    /// The extended document, with the signature window still empty.
    #[must_use]
    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    /// Consumes the result, yielding the extended document.
    #[must_use]
    pub fn into_bytes(self) -> Vec<u8> {
        self.bytes
    }

    /// The `/ByteRange` array as written into the document: two
    /// `(offset, length)` pairs covering everything except the signature.
    #[must_use]
    pub fn byte_range(&self) -> [usize; 4] {
        self.byte_range
    }

    /// The reserved window, from the `<` through the `>` inclusive. A signer
    /// writes its hexadecimal digits strictly between those brackets.
    #[must_use]
    pub fn contents_span(&self) -> Range<usize> {
        self.contents.clone()
    }
}

/// Appends a revision reserving an invisible signature's window.
///
/// # Errors
///
/// Returns [`SigningError`] when `original` is not a PDF this release reads
/// (the rejection names what was unsupported), or when the resulting file is
/// too large for the format's fixed-width offset fields.
pub fn append_signature_placeholder(
    original: &[u8],
    options: &PlaceholderOptions,
) -> Result<PreparedPdf> {
    let doc = PdfDocument::parse(original)?;
    let catalog_number = doc.catalog_number();
    let catalog = doc.dict_at(catalog_number)?;
    if catalog.has(b"AcroForm") {
        return Err(SigningError::Unsupported {
            what: "a document that already carries an interactive form (/AcroForm)",
        });
    }
    let page_number = first_page(&doc)?;
    if page_number == catalog_number {
        // A crafted document can make the page walk arrive back at the
        // catalog object (a /Type /Page root whose /Pages points at itself).
        // The catalog rewrite and the page rewrite would then race on ONE
        // object number and the loser's key would silently vanish.
        return Err(SigningError::Unsupported {
            what: "a page tree whose first page is the catalog object itself",
        });
    }
    let page = doc.dict_at(page_number)?;
    if page
        .get(b"Annots")
        .is_some_and(|raw| raw.first() != Some(&b'['))
    {
        return Err(SigningError::Unsupported {
            what: "a page whose /Annots is an indirect reference rather than an array",
        });
    }

    let mut builder = RevisionBuilder::new(&doc);
    let signature_number = builder.allocate()?;
    let widget_number = builder.allocate()?;
    let form_number = builder.allocate()?;
    let signature = objects::signature_dict(options.contents_capacity);
    let (byte_range_at, contents_at, contents_len) = (
        signature.byte_range_at,
        signature.contents_at,
        signature.contents_len,
    );
    builder.set_object(signature_number, signature.body);
    builder.set_object(
        widget_number,
        objects::widget_dict(signature_number, page_number),
    );
    builder.set_object(form_number, objects::acroform_dict(widget_number));
    builder.set_object(
        catalog_number,
        objects::catalog_with_form(&catalog, form_number),
    );
    builder.set_object(page_number, objects::page_with_annot(&page, widget_number));

    let mut revision = builder.finish()?;
    let body_at = revision
        .body_offset(signature_number)
        .ok_or(SigningError::Malformed {
            offset: 0,
            what: "the signature object that was just written",
        })?;
    let gap_start = body_at.saturating_add(contents_at);
    let gap_end = gap_start.saturating_add(contents_len);
    let byte_range = compute_byte_range(revision.bytes().len(), gap_start, gap_end)?;
    let rendered = render_byte_range(byte_range)?;
    revision.patch(body_at.saturating_add(byte_range_at), &rendered)?;
    Ok(PreparedPdf {
        bytes: revision.into_bytes(),
        byte_range,
        contents: gap_start..gap_end,
    })
}

/// Computes the two signed ranges around the reserved window.
///
/// Every value is checked rather than assumed: the gap positions are derived
/// from a parsed document, so "the gap is inside the file" is something to
/// establish, not to trust — and an unchecked subtraction here would wrap in
/// release builds into a range that claims to cover far more than the file
/// holds.
pub(crate) fn compute_byte_range(
    total: usize,
    gap_start: usize,
    gap_end: usize,
) -> Result<[usize; 4]> {
    if gap_start > gap_end || gap_end > total {
        return Err(SigningError::OutOfRange {
            offset: gap_start,
            what: "the reserved signature window does not lie inside the document",
        });
    }
    let tail = total.checked_sub(gap_end).ok_or(SigningError::OutOfRange {
        offset: gap_end,
        what: "the bytes following the reserved signature window",
    })?;
    Ok([0, gap_start, gap_end, tail])
}

/// Renders the four fields at the fixed width the placeholder reserved.
fn render_byte_range(range: [usize; 4]) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    for (index, value) in range.into_iter().enumerate() {
        if index > 0 {
            out.push(b' ');
        }
        out.extend_from_slice(fixed_offset(value, "a /ByteRange field")?.as_bytes());
    }
    Ok(out)
}
