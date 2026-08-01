//! Finding the signature the way a reader finds it.
//!
//! The walk is structural — trailer `/Root` → catalog → `/AcroForm` →
//! `/Fields` → the field's `/V` — and never a byte scan, which matters more
//! here than anywhere else in the crate. A verifier that located the
//! signature by searching for `/ByteRange` would check whichever occurrence
//! it hit first, while a reader resolves the one the document's structure
//! actually points at; a crafted file can make those two different objects.
//! Checking a signature nobody sees is not verification.
//!
//! **One signature per document, this release.** Two fields carrying a value
//! is refused by name rather than half-handled: which revision each covers,
//! and whether an earlier one is invalidated by a later one, is a design of
//! its own.

use core::ops::Range;

use shojiku_signing::{array_elements, dict_value_span, parse_ref, Dict, PdfDocument};

use crate::error::{Result, VerifyError};
use crate::limits::MAX_FORM_FIELDS;

#[cfg(test)]
mod tests;

/// The signature dictionary, and where its `/Contents` value sits.
pub(crate) struct Located<'a> {
    /// The signature dictionary itself.
    pub(crate) dict: Dict<'a>,
    /// The `/Contents` value's byte range, from the `<` through the `>`
    /// inclusive — the span the signed ranges must leave out.
    pub(crate) contents: Range<usize>,
}

/// Walks `doc` to its one signature.
pub(crate) fn locate<'a>(pdf: &'a [u8], doc: &PdfDocument<'a>) -> Result<Located<'a>> {
    let signature_number = signature_object(doc)?;
    let dict = doc.dict_at(signature_number)?;
    check_sub_filter(&dict)?;
    let body = doc.body_start(signature_number)?;
    let contents = dict_value_span(pdf, body, b"Contents")?.ok_or(VerifyError::Malformed {
        what: "a /Contents entry in the signature dictionary",
    })?;
    Ok(Located { dict, contents })
}

/// The object number of the document's one signature dictionary.
fn signature_object(doc: &PdfDocument<'_>) -> Result<u32> {
    let catalog = doc.dict_at(doc.catalog_number())?;
    let form_ref = catalog
        .get_ref(b"AcroForm", "the catalog's /AcroForm")?
        .ok_or(VerifyError::NoSignature)?;
    let form = doc.dict_at(form_ref.number)?;
    let fields = form.get(b"Fields").ok_or(VerifyError::NoSignature)?;
    let elements = array_elements(fields, "the interactive form's /Fields")?;
    if elements.len() > MAX_FORM_FIELDS {
        return Err(VerifyError::LimitExceeded {
            what: "entries in the interactive form's /Fields array",
            cap: MAX_FORM_FIELDS,
        });
    }
    let mut found: Option<u32> = None;
    for element in elements {
        let Some(number) = signature_value(doc, element)? else {
            continue;
        };
        if found.is_some() {
            return Err(VerifyError::Unsupported {
                what: "a document carrying more than one signature",
            });
        }
        found = Some(number);
    }
    found.ok_or(VerifyError::NoSignature)
}

/// The signature object a `/Fields` element points at, if it is a signature
/// field that has been filled in.
fn signature_value(doc: &PdfDocument<'_>, element: &[u8]) -> Result<Option<u32>> {
    let reference = parse_ref(element, "an entry of the /Fields array")?;
    let field = doc.dict_at(reference.number)?;
    if field.get(b"FT") != Some(b"/Sig".as_slice()) {
        return Ok(None);
    }
    Ok(field
        .get_ref(b"V", "a signature field's /V")?
        .map(|value| value.number))
}

/// Rejects a signature this release does not know how to read.
fn check_sub_filter(dict: &Dict<'_>) -> Result<()> {
    if dict.get(b"SubFilter") == Some(b"/adbe.pkcs7.detached".as_slice()) {
        return Ok(());
    }
    Err(VerifyError::Unsupported {
        what: "a signature whose /SubFilter is not adbe.pkcs7.detached",
    })
}
