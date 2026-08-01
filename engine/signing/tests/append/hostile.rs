//! Hostile input over real bytes: each case must produce a structured
//! failure, and none of them may panic.
//!
//! The fixtures are mutations of a document this engine actually rendered,
//! which is the shape an attacker starts from — a file that is valid
//! everywhere except where it is not.

use shojiku_signing::{
    append_signature_placeholder, PdfDocument, PlaceholderOptions, SigningError,
};

use crate::common::{
    example, last_startxref, overwrite, read_section, rfind_bytes, root_number, splice,
};

fn receipt() -> Vec<u8> {
    example("business/receipt-ja/output.pdf")
}

/// Both public entry points must refuse the bytes; returns the writer's error.
fn assert_refused(bytes: &[u8], case: &str) -> SigningError {
    assert!(
        PdfDocument::parse(bytes).is_err(),
        "{case}: parsing must fail"
    );
    append_signature_placeholder(bytes, &PlaceholderOptions::default())
        .err()
        .unwrap_or_else(|| panic!("{case}: preparing must fail"))
}

/// The cross-reference entry text for the catalog of `bytes`.
fn catalog_entry(bytes: &[u8]) -> (usize, String) {
    let (entries, trailer) = read_section(bytes, last_startxref(bytes));
    let root = root_number(&trailer);
    let offset = entries
        .iter()
        .find(|(number, _)| *number == root)
        .map(|(_, offset)| *offset)
        .expect("the catalog's entry");
    (offset, format!("{offset:010} 00000 n"))
}

#[test]
fn a_truncated_file_fails_at_every_cut() {
    let full = receipt();
    for divisor in [2, 3, 4, 8, 100] {
        let kept = full.len() / divisor;
        let truncated = full.get(..kept).expect("a prefix");
        assert_refused(truncated, &format!("truncated to {kept} bytes"));
    }
}

#[test]
fn a_file_without_a_trailer_is_refused() {
    let mut broken = receipt();
    overwrite(&mut broken, b"trailer", b"trailXX");
    let error = assert_refused(&broken, "the trailer keyword removed");
    assert!(
        matches!(error, SigningError::Malformed { .. }),
        "got {error:?}"
    );
}

#[test]
fn a_startxref_pointing_past_the_end_of_the_file_is_refused() {
    let full = receipt();
    let at = rfind_bytes(&full, b"startxref").expect("a startxref");
    let mut broken = full.get(..at).expect("a prefix").to_vec();
    // The largest value that parses at all: the offset must be refused as
    // out of range rather than truncated into a position inside the file.
    broken.extend_from_slice(b"startxref\n18446744073709551615\n%%EOF");
    let error = assert_refused(&broken, "startxref at the integer maximum");
    assert!(
        matches!(error, SigningError::OutOfRange { .. }),
        "got {error:?}"
    );
}

#[test]
fn an_entry_pointing_into_the_middle_of_another_object_is_refused() {
    let mut broken = receipt();
    let (offset, entry) = catalog_entry(&broken);
    // Six bytes into the catalog's own header is inside the file but is not
    // an object header, which is exactly the forgery the check exists for.
    overwrite(
        &mut broken,
        entry.as_bytes(),
        format!("{:010} 00000 n", offset + 6).as_bytes(),
    );
    let error = assert_refused(&broken, "an entry pointing inside another object");
    assert!(
        matches!(error, SigningError::Malformed { .. }),
        "got {error:?}"
    );
}

#[test]
fn an_entry_offset_past_the_end_of_the_file_is_refused() {
    let mut broken = receipt();
    let (_, entry) = catalog_entry(&broken);
    overwrite(&mut broken, entry.as_bytes(), b"9999999999 00000 n");
    let error = assert_refused(&broken, "an entry offset far past the end of the file");
    assert!(
        matches!(error, SigningError::OutOfRange { .. }),
        "got {error:?}"
    );
}

#[test]
fn object_numbering_at_the_integer_maximum_is_refused() {
    // The trailer's /Size drives the numbers the writer would allocate from.
    // At the integer maximum it must be refused, never wrapped into a small
    // number that would collide with objects the document already has.
    let full = receipt();
    let (_, trailer) = read_section(&full, last_startxref(&full));
    let size = trailer
        .split("/Size ")
        .nth(1)
        .expect("a /Size")
        .split('/')
        .next()
        .expect("digits");
    let broken = splice(
        &full,
        format!("/Size {size}").as_bytes(),
        b"/Size 18446744073709551615",
    );
    let error = assert_refused(&broken, "a /Size at the integer maximum");
    assert!(
        matches!(error, SigningError::OutOfRange { .. }),
        "got {error:?}"
    );
}

#[test]
fn a_cross_reference_chain_that_points_at_itself_is_refused() {
    let full = receipt();
    let xref_at = last_startxref(&full);
    let broken = splice(
        &full,
        b"/Size ",
        format!("/Prev {xref_at}/Size ").as_bytes(),
    );
    let error = assert_refused(&broken, "a /Prev pointing at its own section");
    assert!(
        matches!(error, SigningError::Malformed { .. }),
        "got {error:?}"
    );
}
