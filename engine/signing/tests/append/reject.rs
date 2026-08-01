//! Structures this release deliberately does not read. Each rejection must
//! NAME what was unsupported: a bare "cannot read this file" on a document a
//! caller considers ordinary is the pain this project exists to avoid.

use shojiku_signing::{
    append_signature_placeholder, PdfDocument, PlaceholderOptions, SigningError,
};

use crate::common::{example, rfind_bytes, splice};

fn receipt() -> Vec<u8> {
    example("business/receipt-ja/output.pdf")
}

fn rejection(bytes: &[u8]) -> String {
    match append_signature_placeholder(bytes, &PlaceholderOptions::default()) {
        Err(SigningError::Unsupported { what }) => what.to_string(),
        other => panic!("expected a named rejection, got {other:?}"),
    }
}

#[test]
fn a_cross_reference_stream_is_named() {
    // Point startxref at an object rather than at a table, which is what a
    // cross-reference-stream document looks like from the tail.
    let full = receipt();
    let at = rfind_bytes(&full, b"startxref").expect("a startxref");
    let mut broken = full.get(..at).expect("a prefix").to_vec();
    broken.extend_from_slice(b"startxref\n9\n%%EOF");
    let what = rejection(&broken);
    assert!(
        what.contains("cross-reference stream"),
        "the rejection names it: {what}"
    );
}

#[test]
fn a_hybrid_reference_file_is_named() {
    let broken = splice(&receipt(), b"/Size ", b"/XRefStm 1234/Size ");
    let what = rejection(&broken);
    assert!(
        what.contains("/XRefStm"),
        "the rejection names the marker: {what}"
    );
}

#[test]
fn an_encrypted_document_is_named() {
    let broken = splice(&receipt(), b"/Size ", b"/Encrypt 9 0 R/Size ");
    let what = rejection(&broken);
    assert!(
        what.contains("/Encrypt"),
        "the rejection names the entry: {what}"
    );
}

#[test]
fn preparing_never_alters_the_file_it_refused() {
    let original = receipt();
    let broken = splice(&original, b"/Size ", b"/Encrypt 9 0 R/Size ");
    let before = broken.clone();
    let _ = append_signature_placeholder(&broken, &PlaceholderOptions::default());
    assert_eq!(
        broken, before,
        "a refusal leaves the caller's bytes untouched"
    );
    assert!(
        PdfDocument::parse(&original).is_ok(),
        "and the untouched original still reads"
    );
}
