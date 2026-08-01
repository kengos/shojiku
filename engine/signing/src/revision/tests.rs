//! Unit tests for the revision writer.

use super::*;
use crate::testkit::{build_pdf_with_size, simple_pdf};
use crate::xref;

#[test]
fn the_original_bytes_survive_as_a_prefix() {
    let bytes = simple_pdf();
    let doc = PdfDocument::parse(&bytes).expect("parses");
    let mut builder = RevisionBuilder::new(&doc);
    let number = builder.allocate().expect("allocates");
    builder.set_object(number, b"<</Marker 1>>".to_vec());
    let revision = builder.finish().expect("finishes");
    assert!(
        revision.bytes().starts_with(&bytes),
        "the append must not move a byte"
    );
    assert!(revision.bytes().len() > bytes.len());
}

#[test]
fn the_appended_revision_is_readable_and_points_back() {
    let bytes = simple_pdf();
    let doc = PdfDocument::parse(&bytes).expect("parses");
    let previous_startxref = doc.startxref;
    let mut builder = RevisionBuilder::new(&doc);
    let number = builder.allocate().expect("allocates");
    builder.set_object(number, b"<</Marker 1>>".to_vec());
    let extended = builder.finish().expect("finishes").into_bytes();

    let doc = PdfDocument::parse(&extended).expect("parses the extension");
    assert_eq!(
        doc.dict_at(number).expect("new object").get(b"Marker"),
        Some(b"1".as_slice())
    );
    assert_eq!(doc.size, number + 1);
    // /Root, /Info and /ID are carried; /Prev points at the older section.
    assert_eq!(doc.trailer_value(b"ID"), Some(b"[(a)(a)]".as_slice()));
    assert_eq!(
        doc.trailer.get_uint(b"Prev", "prev"),
        Ok(Some(previous_startxref as u64))
    );
}

#[test]
fn every_new_entry_resolves_to_the_object_it_claims() {
    let bytes = simple_pdf();
    let doc = PdfDocument::parse(&bytes).expect("parses");
    let mut builder = RevisionBuilder::new(&doc);
    let first = builder.allocate().expect("allocates");
    let second = builder.allocate().expect("allocates");
    builder.set_object(first, b"<</A 1>>".to_vec());
    builder.set_object(second, b"<</B 2>>".to_vec());
    builder.set_object(3, b"<</Type/Catalog/Pages 1 0 R>>".to_vec());
    let extended = builder.finish().expect("finishes").into_bytes();

    let doc = PdfDocument::parse(&extended).expect("parses");
    for number in [first, second, 3] {
        doc.body_start(number)
            .expect("every entry resolves to its own header");
    }
}

#[test]
fn appending_twice_is_byte_identical_for_the_same_input() {
    let run = || {
        let bytes = simple_pdf();
        let doc = PdfDocument::parse(&bytes).expect("parses");
        let mut builder = RevisionBuilder::new(&doc);
        builder.set_object(3, b"<</Type/Catalog/Pages 1 0 R>>".to_vec());
        builder.finish().expect("finishes").into_bytes()
    };
    assert_eq!(
        run(),
        run(),
        "the writer must add no time, randomness or ordering drift"
    );
}

#[test]
fn a_revision_must_carry_at_least_one_object() {
    let bytes = simple_pdf();
    let doc = PdfDocument::parse(&bytes).expect("parses");
    assert_eq!(
        RevisionBuilder::new(&doc).finish().expect_err("fails"),
        SigningError::InvalidOption {
            what: "a revision must add or replace at least one object",
        }
    );
}

#[test]
fn an_understated_trailer_size_does_not_collide_with_existing_objects() {
    // A hostile /Size below the numbers the table actually describes must
    // not hand out a number that silently replaces an existing object.
    let bytes = crate::testkit::build_pdf_with_size(
        &[
            (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
            (2, "<</Type/Page/Parent 1 0 R>>"),
            (3, "<</Type/Catalog/Pages 1 0 R>>"),
        ],
        3,
        Some(2),
    );
    let doc = PdfDocument::parse(&bytes).expect("parses");
    let mut builder = RevisionBuilder::new(&doc);
    assert_eq!(
        builder.allocate(),
        Ok(4),
        "numbering starts above the highest EXISTING object, not the lying /Size"
    );
}

#[test]
fn object_numbers_run_out_at_the_cap() {
    let bytes = build_pdf_with_size(
        &[(1, "<</Type/Catalog>>")],
        1,
        Some(crate::limits::MAX_OBJECT_NUMBER),
    );
    let doc = PdfDocument::parse(&bytes).expect("parses");
    let mut builder = RevisionBuilder::new(&doc);
    assert_eq!(builder.allocate(), Ok(crate::limits::MAX_OBJECT_NUMBER));
    assert_eq!(
        builder.allocate().expect_err("fails"),
        SigningError::OutOfRange {
            offset: 0,
            what: "the next object number"
        }
    );
}

#[test]
fn consecutive_object_numbers_share_one_subsection() {
    let mut headers = BTreeMap::new();
    headers.insert(4, 100);
    headers.insert(5, 200);
    headers.insert(9, 300);
    let runs = contiguous_runs(&headers);
    assert_eq!(runs, vec![(4, vec![100, 200]), (9, vec![300])]);

    let mut out = Vec::new();
    write_xref(&mut out, &headers).expect("writes");
    let text = String::from_utf8(out).expect("ascii");
    assert_eq!(
        text,
        "xref\n4 2\n0000000100 00000 n\r\n0000000200 00000 n\r\n9 1\n0000000300 00000 n\r\n"
    );
    // Each entry is exactly the twenty bytes the format requires: only entry
    // lines carry the CR, so they are the ones to measure.
    for line in text.split('\n') {
        if line.ends_with('\r') {
            assert_eq!(
                line.len() + 1,
                20,
                "entry {line:?} must be exactly twenty bytes"
            );
        }
    }
}

#[test]
fn the_written_table_parses_back_as_the_entries_it_described() {
    let mut headers = BTreeMap::new();
    headers.insert(1, 10);
    headers.insert(2, 20);
    let mut out = Vec::new();
    write_xref(&mut out, &headers).expect("writes");
    out.extend_from_slice(b"trailer\n<</Size 3>>");
    let mut budget = crate::limits::MAX_XREF_ENTRIES;
    let section = xref::parse_section(&out, 0, &mut budget).expect("round-trips");
    assert_eq!(section.entries, vec![(1, 10), (2, 20)]);
}

#[test]
fn an_offset_past_the_fixed_field_width_is_refused() {
    assert_eq!(fixed_offset(0, "n"), Ok("0000000000".to_string()));
    assert_eq!(
        fixed_offset(MAX_FIXED_WIDTH_OFFSET, "n"),
        Ok("9999999999".to_string())
    );
    assert_eq!(
        fixed_offset(MAX_FIXED_WIDTH_OFFSET + 1, "an offset").expect_err("fails"),
        SigningError::OutOfRange {
            offset: 0,
            what: "an offset"
        }
    );
    let mut headers = BTreeMap::new();
    headers.insert(1, MAX_FIXED_WIDTH_OFFSET + 1);
    assert!(write_xref(&mut Vec::new(), &headers).is_err());
}

#[test]
fn patching_is_bounded_by_the_buffer() {
    let bytes = simple_pdf();
    let doc = PdfDocument::parse(&bytes).expect("parses");
    let mut builder = RevisionBuilder::new(&doc);
    let number = builder.allocate().expect("allocates");
    builder.set_object(number, b"<</Marker 0000>>".to_vec());
    let mut revision = builder.finish().expect("finishes");

    let body = revision.body_offset(number).expect("a body offset");
    assert_eq!(revision.body_offset(number + 99), None);
    revision
        .patch(body + 10, b"1234")
        .expect("patches inside the buffer");
    assert!(revision.bytes().windows(4).any(|window| window == b"1234"));
    assert_eq!(
        revision.patch(usize::MAX - 1, b"1234").expect_err("fails"),
        SigningError::OutOfRange {
            offset: usize::MAX - 1,
            what: "a placeholder to patch"
        }
    );
}
