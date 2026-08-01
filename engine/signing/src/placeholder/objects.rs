//! The objects an invisible signature adds, emitted as bytes.
//!
//! Two of them are REWRITES of dictionaries the document already had — the
//! catalog gains `/AcroForm`, the first page gains a widget in `/Annots` —
//! and both are rebuilt by copying every existing key's raw value through
//! unchanged. Copying rather than re-encoding is what keeps an appended
//! revision honest: the only difference a reader can observe is the key that
//! was added.

use crate::object::Dict;

/// A signature dictionary plus the positions, relative to its own start, of
/// the two windows that get overwritten once the real signature exists.
pub(crate) struct SignatureDict {
    /// The dictionary's bytes.
    pub(crate) body: Vec<u8>,
    /// Offset of the first `/ByteRange` digit.
    pub(crate) byte_range_at: usize,
    /// Offset of the `<` opening the `/Contents` hexadecimal string.
    pub(crate) contents_at: usize,
    /// Length of that string INCLUDING both angle brackets — the span the
    /// signed byte ranges leave out.
    pub(crate) contents_len: usize,
}

/// Builds the signature dictionary with both windows reserved.
///
/// `/ByteRange` is written as four fixed-width fields so the real offsets can
/// be patched in without moving a single byte — the array is itself inside
/// the signed region, so any shift would invalidate the digest it describes.
pub(crate) fn signature_dict(capacity: usize) -> SignatureDict {
    let mut body =
        Vec::from(b"<</Type /Sig/Filter /Adobe.PPKLite/SubFilter /adbe.pkcs7.detached".as_slice());
    body.extend_from_slice(b"/ByteRange [");
    let byte_range_at = body.len();
    body.extend_from_slice(b"0000000000 0000000000 0000000000 0000000000]/Contents ");
    let contents_at = body.len();
    body.push(b'<');
    body.resize(body.len().saturating_add(capacity.saturating_mul(2)), b'0');
    body.push(b'>');
    let contents_len = body.len().saturating_sub(contents_at);
    body.extend_from_slice(b">>");
    SignatureDict {
        body,
        byte_range_at,
        contents_at,
        contents_len,
    }
}

/// Builds the widget annotation that carries the signature field.
///
/// The field is invisible: a zero-area rectangle draws nothing, which is what
/// this release ships. The annotation flags are Print (bit 3, value 4) and
/// Locked (bit 8, value 128), so the field cannot be edited away by a reader.
pub(crate) fn widget_dict(signature: u32, page: u32) -> Vec<u8> {
    format!(
        "<</Type /Annot/Subtype /Widget/FT /Sig/Rect [0 0 0 0]/F 132\
         /T (Signature1)/V {signature} 0 R/P {page} 0 R>>"
    )
    .into_bytes()
}

/// Builds the interactive-form dictionary.
///
/// `/SigFlags 3` is SignaturesExist (bit 1) plus AppendOnly (bit 2): the
/// document holds a signature, and saving it in any way other than an
/// incremental update may invalidate that signature.
pub(crate) fn acroform_dict(widget: u32) -> Vec<u8> {
    format!("<</Fields [{widget} 0 R]/SigFlags 3>>").into_bytes()
}

/// Re-emits the catalog with `/AcroForm` added.
pub(crate) fn catalog_with_form(catalog: &Dict<'_>, form: u32) -> Vec<u8> {
    let mut out = Vec::from(b"<<".as_slice());
    for (key, value) in &catalog.entries {
        push_entry(&mut out, key, value);
    }
    push_entry(&mut out, b"AcroForm", format!("{form} 0 R").as_bytes());
    out.extend_from_slice(b">>");
    out
}

/// Re-emits the page with the widget appended to `/Annots`, merging into an
/// existing array when the page already carries annotations (a rendered
/// document's links are exactly that case) and adding the key otherwise.
pub(crate) fn page_with_annot(page: &Dict<'_>, widget: u32) -> Vec<u8> {
    let mut out = Vec::from(b"<<".as_slice());
    let mut merged = false;
    for (key, value) in &page.entries {
        if *key == b"Annots" {
            merged = true;
            let inner = value
                .get(1..value.len().saturating_sub(1))
                .unwrap_or_default();
            let mut array = Vec::from(b"[".as_slice());
            array.extend_from_slice(inner);
            array.extend_from_slice(format!(" {widget} 0 R]").as_bytes());
            push_entry(&mut out, key, &array);
        } else {
            push_entry(&mut out, key, value);
        }
    }
    if !merged {
        push_entry(&mut out, b"Annots", format!("[{widget} 0 R]").as_bytes());
    }
    out.extend_from_slice(b">>");
    out
}

/// Writes one `/Key value` pair.
fn push_entry(out: &mut Vec<u8>, key: &[u8], value: &[u8]) {
    out.push(b'/');
    out.extend_from_slice(key);
    out.push(b' ');
    out.extend_from_slice(value);
}
