//! Unit tests for the structural walk to a document's signature.

use super::*;
use crate::testkit::{build_pdf, signed_pdf};

/// Walks a fixture built from `objects`, with `root` as its catalog.
fn locate_in(objects: &[(u32, &str)], root: u32) -> Result<()> {
    let pdf = build_pdf(objects, root);
    let document = PdfDocument::parse(&pdf)?;
    locate(&pdf, &document).map(|_| ())
}

/// The objects of a document carrying one filled-in signature field.
const SIGNED: &[(u32, &str)] = &[
    (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
    (2, "<</Type/Page/Parent 1 0 R/Annots[5 0 R]>>"),
    (3, "<</Type/Catalog/Pages 1 0 R/AcroForm 4 0 R>>"),
    (4, "<</Fields [5 0 R]/SigFlags 3>>"),
    (5, "<</Type/Annot/FT /Sig/V 6 0 R>>"),
    (
        6,
        "<</Type /Sig/SubFilter /adbe.pkcs7.detached/ByteRange [0 1 2 3]/Contents <00>>>",
    ),
];

#[test]
fn a_real_signed_document_yields_its_signature_and_window() {
    let pdf = signed_pdf("rsa2048");
    let document = PdfDocument::parse(&pdf).expect("parses");
    let located = locate(&pdf, &document).expect("carries a signature");
    assert_eq!(
        located.dict.get(b"SubFilter"),
        Some(b"/adbe.pkcs7.detached".as_slice())
    );
    // The window is a hexadecimal string, brackets included.
    let window = pdf.get(located.contents).expect("inside the document");
    assert_eq!(window.first(), Some(&b'<'));
    assert_eq!(window.last(), Some(&b'>'));
}

#[test]
fn a_synthetic_signature_field_is_found_the_same_way() {
    assert_eq!(locate_in(SIGNED, 3), Ok(()));
}

#[test]
fn a_document_without_an_interactive_form_carries_no_signature() {
    let objects = &[
        (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
        (2, "<</Type/Page/Parent 1 0 R>>"),
        (3, "<</Type/Catalog/Pages 1 0 R>>"),
    ];
    assert_eq!(locate_in(objects, 3), Err(VerifyError::NoSignature));
}

#[test]
fn a_form_without_fields_carries_no_signature() {
    let objects = &[
        (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
        (2, "<</Type/Page/Parent 1 0 R>>"),
        (3, "<</Type/Catalog/Pages 1 0 R/AcroForm 4 0 R>>"),
        (4, "<</SigFlags 3>>"),
    ];
    assert_eq!(locate_in(objects, 3), Err(VerifyError::NoSignature));
}

#[test]
fn an_empty_fields_array_carries_no_signature() {
    let objects = &[
        (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
        (2, "<</Type/Page/Parent 1 0 R>>"),
        (3, "<</Type/Catalog/Pages 1 0 R/AcroForm 4 0 R>>"),
        (4, "<</Fields []>>"),
    ];
    assert_eq!(locate_in(objects, 3), Err(VerifyError::NoSignature));
}

#[test]
fn a_fields_entry_that_is_not_a_signature_field_is_skipped() {
    // A text field beside the signature: the walk must pass over it rather
    // than mistake it for a second signature.
    let objects = &[
        (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
        (2, "<</Type/Page/Parent 1 0 R>>"),
        (3, "<</Type/Catalog/Pages 1 0 R/AcroForm 4 0 R>>"),
        (4, "<</Fields [7 0 R 5 0 R]>>"),
        (5, "<</Type/Annot/FT /Sig/V 6 0 R>>"),
        (
            6,
            "<</Type /Sig/SubFilter /adbe.pkcs7.detached/Contents <00>>>",
        ),
        (7, "<</FT /Tx/V (text)>>"),
    ];
    assert_eq!(locate_in(objects, 3), Ok(()));
}

#[test]
fn an_unfilled_signature_field_carries_no_signature() {
    let objects = &[
        (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
        (2, "<</Type/Page/Parent 1 0 R>>"),
        (3, "<</Type/Catalog/Pages 1 0 R/AcroForm 4 0 R>>"),
        (4, "<</Fields [5 0 R]>>"),
        (5, "<</FT /Sig>>"),
    ];
    assert_eq!(locate_in(objects, 3), Err(VerifyError::NoSignature));
}

#[test]
fn a_second_signature_is_refused_by_name() {
    // Which revision each signature covers, and whether a later one
    // invalidates an earlier one, is a design of its own.
    let objects = &[
        (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
        (2, "<</Type/Page/Parent 1 0 R>>"),
        (3, "<</Type/Catalog/Pages 1 0 R/AcroForm 4 0 R>>"),
        (4, "<</Fields [5 0 R 7 0 R]>>"),
        (5, "<</FT /Sig/V 6 0 R>>"),
        (
            6,
            "<</Type /Sig/SubFilter /adbe.pkcs7.detached/Contents <00>>>",
        ),
        (7, "<</FT /Sig/V 6 0 R>>"),
    ];
    assert_eq!(
        locate_in(objects, 3),
        Err(VerifyError::Unsupported {
            what: "a document carrying more than one signature"
        })
    );
}

#[test]
fn a_fields_entry_that_is_not_a_reference_is_refused() {
    let objects = &[
        (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
        (2, "<</Type/Page/Parent 1 0 R>>"),
        (3, "<</Type/Catalog/Pages 1 0 R/AcroForm 4 0 R>>"),
        (4, "<</Fields [(not a reference)]>>"),
    ];
    assert!(matches!(
        locate_in(objects, 3),
        Err(VerifyError::Document(_))
    ));
}

#[test]
fn a_fields_value_that_is_not_an_array_is_refused() {
    let objects = &[
        (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
        (2, "<</Type/Page/Parent 1 0 R>>"),
        (3, "<</Type/Catalog/Pages 1 0 R/AcroForm 4 0 R>>"),
        (4, "<</Fields 5>>"),
    ];
    assert!(matches!(
        locate_in(objects, 3),
        Err(VerifyError::Document(_))
    ));
}

#[test]
fn a_signature_with_an_unrecognized_sub_filter_is_refused_by_name() {
    let objects = &[
        (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
        (2, "<</Type/Page/Parent 1 0 R>>"),
        (3, "<</Type/Catalog/Pages 1 0 R/AcroForm 4 0 R>>"),
        (4, "<</Fields [5 0 R]>>"),
        (5, "<</FT /Sig/V 6 0 R>>"),
        (
            6,
            "<</Type /Sig/SubFilter /ETSI.CAdES.detached/Contents <00>>>",
        ),
    ];
    assert_eq!(
        locate_in(objects, 3),
        Err(VerifyError::Unsupported {
            what: "a signature whose /SubFilter is not adbe.pkcs7.detached"
        })
    );
}

#[test]
fn a_signature_without_a_contents_entry_is_refused() {
    let objects = &[
        (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
        (2, "<</Type/Page/Parent 1 0 R>>"),
        (3, "<</Type/Catalog/Pages 1 0 R/AcroForm 4 0 R>>"),
        (4, "<</Fields [5 0 R]>>"),
        (5, "<</FT /Sig/V 6 0 R>>"),
        (6, "<</Type /Sig/SubFilter /adbe.pkcs7.detached>>"),
    ];
    assert_eq!(
        locate_in(objects, 3),
        Err(VerifyError::Malformed {
            what: "a /Contents entry in the signature dictionary"
        })
    );
}

#[test]
fn a_signature_pointing_at_an_object_that_is_not_there_is_refused() {
    let objects = &[
        (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
        (2, "<</Type/Page/Parent 1 0 R>>"),
        (3, "<</Type/Catalog/Pages 1 0 R/AcroForm 4 0 R>>"),
        (4, "<</Fields [5 0 R]>>"),
        (5, "<</FT /Sig/V 99 0 R>>"),
    ];
    assert!(matches!(
        locate_in(objects, 3),
        Err(VerifyError::Document(_))
    ));
}

#[test]
fn more_fields_than_this_release_reads_are_refused() {
    let mut array = String::from("<</Fields [");
    for _ in 0..=MAX_FORM_FIELDS {
        array.push_str("5 0 R ");
    }
    array.push_str("]>>");
    let objects = &[
        (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
        (2, "<</Type/Page/Parent 1 0 R>>"),
        (3, "<</Type/Catalog/Pages 1 0 R/AcroForm 4 0 R>>"),
        (4, array.as_str()),
        (5, "<</FT /Tx>>"),
    ];
    assert_eq!(
        locate_in(objects, 3),
        Err(VerifyError::LimitExceeded {
            what: "entries in the interactive form's /Fields array",
            cap: MAX_FORM_FIELDS
        })
    );
}
