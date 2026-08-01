//! Unit tests for reading a document's tail, chain and objects.

use super::*;
use crate::revision::RevisionBuilder;
use crate::testkit::{build_pdf, simple_pdf};

mod pages;

/// A one-object document whose trailer carries `extra`, which is built from
/// the cross-reference offset so a test can point `/Prev` at it.
fn pdf_with_trailer(extra: impl FnOnce(usize) -> String) -> Vec<u8> {
    let mut out = Vec::from(b"%PDF-1.7\n".as_slice());
    out.extend_from_slice(b"1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n");
    let xref = out.len();
    out.extend_from_slice(b"xref\n0 2\n0000000000 65535 f\r\n0000000009 00000 n\r\n");
    let extra = extra(xref);
    out.extend_from_slice(
        format!("trailer\n<</Size 2/Root 1 0 R{extra}>>\nstartxref\n{xref}\n%%EOF").as_bytes(),
    );
    out
}

#[test]
fn parses_a_rendered_shape_document() {
    let bytes = simple_pdf();
    let doc = PdfDocument::parse(&bytes).expect("parses");
    assert_eq!(doc.size, 4);
    assert_eq!(doc.catalog_number(), 3);
    assert_eq!(doc.offsets.len(), 3);
    assert_eq!(doc.trailer_value(b"ID"), Some(b"[(a)(a)]".as_slice()));
    assert_eq!(doc.trailer_value(b"Absent"), None);
    assert_eq!(
        doc.dict_at(3).expect("catalog").get(b"Type"),
        Some(b"/Catalog".as_slice())
    );
}

#[test]
fn anything_without_a_version_header_is_not_a_pdf() {
    for bytes in [
        b"".as_slice(),
        b"%PDF".as_slice(),
        b"not a pdf file".as_slice(),
        b"%PDF-x.7\n".as_slice(),
        b"%PDF-1x7\n".as_slice(),
        b"%PDF-1.x\n".as_slice(),
    ] {
        assert_eq!(
            PdfDocument::parse(bytes).expect_err("fails"),
            SigningError::NotAPdf
        );
    }
}

#[test]
fn a_missing_startxref_keyword_is_a_failure() {
    let bytes = b"%PDF-1.7\nnothing else here at all\n";
    assert!(matches!(
        PdfDocument::parse(bytes),
        Err(SigningError::Malformed {
            what: "a startxref keyword in the file's tail",
            ..
        })
    ));
}

#[test]
fn a_startxref_pointing_past_the_file_is_refused() {
    let bytes = b"%PDF-1.7\nstartxref\n99999999\n%%EOF";
    assert_eq!(
        PdfDocument::parse(bytes).expect_err("fails"),
        SigningError::OutOfRange {
            offset: 18,
            what: "the startxref offset"
        }
    );
}

#[test]
fn a_startxref_without_a_number_is_a_failure() {
    let bytes = b"%PDF-1.7\nstartxref\n%%EOF";
    assert!(matches!(
        PdfDocument::parse(bytes),
        Err(SigningError::Malformed {
            what: "the startxref offset",
            ..
        })
    ));
}

#[test]
fn a_truncated_file_is_a_structured_failure() {
    let full = simple_pdf();
    for keep in [10, full.len() / 2, full.len() - 20] {
        let truncated = full.get(..keep).expect("prefix");
        assert!(PdfDocument::parse(truncated).is_err(), "kept {keep} bytes");
    }
}

#[test]
fn an_encrypted_document_is_rejected_by_name() {
    let bytes = pdf_with_trailer(|_| "/Encrypt 9 0 R".to_string());
    assert_eq!(
        PdfDocument::parse(&bytes).expect_err("fails"),
        SigningError::Unsupported {
            what: "an encrypted document (/Encrypt)"
        }
    );
}

#[test]
fn a_hybrid_reference_file_is_rejected_by_name() {
    let bytes = pdf_with_trailer(|_| "/XRefStm 1234".to_string());
    assert!(matches!(
        PdfDocument::parse(&bytes),
        Err(SigningError::Unsupported { what }) if what.contains("/XRefStm")
    ));
}

#[test]
fn a_chain_that_points_back_at_itself_is_refused() {
    let bytes = pdf_with_trailer(|xref| format!("/Prev {xref}"));
    assert!(matches!(
        PdfDocument::parse(&bytes),
        Err(SigningError::Malformed {
            what: "a cross-reference chain that points back at itself",
            ..
        })
    ));
}

#[test]
fn a_prev_offset_outside_the_file_is_refused() {
    let bytes = pdf_with_trailer(|_| "/Prev 99999999".to_string());
    assert!(matches!(
        PdfDocument::parse(&bytes),
        Err(SigningError::OutOfRange {
            what: "the trailer's /Prev",
            ..
        })
    ));
}

#[test]
fn a_trailer_without_size_or_root_is_a_failure() {
    let mut bytes = simple_pdf();
    let patched = String::from_utf8_lossy(&bytes).replace("/Size 4", "/Sixe 4");
    bytes = patched.into_bytes();
    assert!(matches!(
        PdfDocument::parse(&bytes),
        Err(SigningError::Malformed {
            what: "a trailer /Size entry",
            ..
        })
    ));

    let bytes = simple_pdf();
    let patched = String::from_utf8_lossy(&bytes).replace("/Root 3 0 R", "/Boot 3 0 R");
    assert!(matches!(
        PdfDocument::parse(patched.as_bytes()),
        Err(SigningError::Malformed {
            what: "a trailer /Root entry",
            ..
        })
    ));
}

#[test]
fn a_root_with_no_cross_reference_entry_is_refused_at_parse_time() {
    let bytes = build_pdf(&[(1, "<</Type/Catalog>>")], 9);
    assert!(matches!(
        PdfDocument::parse(&bytes),
        Err(SigningError::Malformed {
            what: "a cross-reference entry for a referenced object",
            ..
        })
    ));
}

#[test]
fn an_offset_pointing_into_the_middle_of_another_object_is_refused() {
    // The classic hostile cross-reference: the catalog's entry is moved to
    // point into the middle of that same object rather than at its header.
    let good = simple_pdf();
    let catalog_at = PdfDocument::parse(&good)
        .expect("parses")
        .offsets
        .get(&3)
        .copied()
        .expect("catalog entry");
    let text = String::from_utf8_lossy(&good).replace(
        &format!("{catalog_at:010} 00000 n"),
        &format!("{:010} 00000 n", catalog_at + 5),
    );
    assert!(matches!(
        PdfDocument::parse(text.as_bytes()),
        Err(SigningError::Malformed { .. })
    ));
}

#[test]
fn an_object_header_naming_a_different_number_is_refused() {
    let bytes = simple_pdf();
    let doc = PdfDocument::parse(&bytes).expect("parses");
    // Object 1's entry exists; asking for it under another number must not
    // silently succeed just because the offset resolves.
    let mut forged = doc.offsets.clone();
    forged.insert(2, *forged.get(&1).expect("entry"));
    let doc = PdfDocument {
        offsets: forged,
        ..doc
    };
    assert_eq!(
        doc.body_start(2).expect_err("fails"),
        SigningError::Malformed {
            offset: 9,
            what: "the object header the cross-reference table points at",
        }
    );
}

#[test]
fn an_object_without_the_obj_keyword_is_refused() {
    let bytes = build_pdf(&[(1, "<</Type/Catalog>>")], 1);
    let text = String::from_utf8_lossy(&bytes).replace("1 0 obj", "1 0 xyz");
    assert!(matches!(
        PdfDocument::parse(text.as_bytes()),
        Err(SigningError::Malformed {
            what: "the obj keyword",
            ..
        })
    ));
}

#[test]
fn the_prev_chain_is_merged_newest_first_and_then_capped() {
    let mut bytes = simple_pdf();
    for round in 0..MAX_XREF_CHAIN {
        let doc = PdfDocument::parse(&bytes).expect("parses each revision");
        // Every section describes the same three objects, so merging the
        // chain must not grow the map — only move the catalog's entry.
        assert_eq!(doc.offsets.len(), 3);
        let mut builder = RevisionBuilder::new(&doc);
        builder.set_object(
            3,
            format!("<</Type/Catalog/Pages 1 0 R/Round {round}>>").into_bytes(),
        );
        bytes = builder.finish().expect("finishes").into_bytes();
    }
    assert_eq!(
        PdfDocument::parse(&bytes).expect_err("fails"),
        SigningError::LimitExceeded {
            what: "cross-reference sections in the /Prev chain",
            cap: MAX_XREF_CHAIN,
        }
    );
}

#[test]
fn a_newer_revision_of_an_object_wins_over_the_older_one() {
    let bytes = simple_pdf();
    let doc = PdfDocument::parse(&bytes).expect("parses");
    let original = doc.offsets.get(&3).copied().expect("catalog entry");
    let mut builder = RevisionBuilder::new(&doc);
    builder.set_object(3, b"<</Type/Catalog/Pages 1 0 R/Marker 7>>".to_vec());
    let extended = builder.finish().expect("finishes").into_bytes();

    let doc = PdfDocument::parse(&extended).expect("parses two revisions");
    assert_ne!(doc.offsets.get(&3).copied(), Some(original));
    assert_eq!(
        doc.dict_at(3).expect("catalog").get(b"Marker"),
        Some(b"7".as_slice())
    );
}

#[test]
fn an_object_header_with_a_non_zero_generation_is_refused() {
    // The cross-reference table and the object header must agree, and the
    // agreement is on generation zero — the property that lets resolution
    // match on the object number alone.
    let mut out = Vec::from(b"%PDF-1.7\n".as_slice());
    out.extend_from_slice(b"1 1 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n");
    let xref = out.len();
    out.extend_from_slice(b"xref\n0 2\n0000000000 65535 f\r\n0000000009 00000 n\r\n");
    out.extend_from_slice(
        format!("trailer\n<</Size 2/Root 1 0 R>>\nstartxref\n{xref}\n%%EOF").as_bytes(),
    );
    assert_eq!(
        PdfDocument::parse(&out).expect_err("fails"),
        SigningError::Unsupported {
            what: "an object header with a non-zero generation number"
        }
    );
}
