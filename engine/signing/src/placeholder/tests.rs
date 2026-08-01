//! Unit tests for the signature placeholder and its byte ranges.

use super::*;
use crate::testkit::{pdf_with_annots, simple_pdf};

fn prepared(source: &[u8]) -> PreparedPdf {
    append_signature_placeholder(source, &PlaceholderOptions::default()).expect("prepares")
}

#[test]
fn options_bound_the_reserved_capacity() {
    assert_eq!(
        PlaceholderOptions::default().contents_capacity(),
        DEFAULT_CONTENTS_CAPACITY
    );
    assert_eq!(
        PlaceholderOptions::with_contents_capacity(MIN_CONTENTS_CAPACITY)
            .expect("accepts the floor")
            .contents_capacity(),
        MIN_CONTENTS_CAPACITY
    );
    PlaceholderOptions::with_contents_capacity(MAX_CONTENTS_CAPACITY).expect("accepts the ceiling");
    for outside in [MIN_CONTENTS_CAPACITY - 1, MAX_CONTENTS_CAPACITY + 1, 0] {
        assert_eq!(
            PlaceholderOptions::with_contents_capacity(outside).expect_err("fails"),
            SigningError::InvalidOption {
                what: "the reserved signature capacity is outside the supported range",
            }
        );
    }
}

#[test]
fn the_ranges_cover_the_whole_file_except_the_reserved_window() {
    let original = simple_pdf();
    let prepared = prepared(&original);
    let [first_start, first_len, second_start, second_len] = prepared.byte_range();
    let total = prepared.bytes().len();

    assert_eq!(first_start, 0);
    assert_eq!(second_start, first_len + prepared.contents_span().len());
    assert_eq!(second_start + second_len, total);
    // Everything except the window is signed, and the window is the gap.
    assert_eq!(
        first_len + second_len + prepared.contents_span().len(),
        total
    );
    assert_eq!(prepared.contents_span(), first_len..second_start);
}

#[test]
fn the_reserved_window_spans_the_hex_string_including_its_delimiters() {
    let original = simple_pdf();
    let options = PlaceholderOptions::with_contents_capacity(MIN_CONTENTS_CAPACITY).expect("valid");
    let prepared = append_signature_placeholder(&original, &options).expect("prepares");
    let span = prepared.contents_span();
    let window = prepared
        .bytes()
        .get(span.clone())
        .expect("the window is inside the file");

    assert_eq!(window.first(), Some(&b'<'));
    assert_eq!(window.last(), Some(&b'>'));
    // Two hexadecimal digits per reserved byte, plus the two delimiters.
    assert_eq!(window.len(), MIN_CONTENTS_CAPACITY * 2 + 2);
    assert!(window
        .get(1..window.len() - 1)
        .expect("digits")
        .iter()
        .all(|b| *b == b'0'));
}

#[test]
fn the_written_byte_range_matches_the_reported_one() {
    let original = simple_pdf();
    let prepared = prepared(&original);
    let text = String::from_utf8_lossy(prepared.bytes()).to_string();
    let [a, b, c, d] = prepared.byte_range();
    let expected = format!("/ByteRange [{a:010} {b:010} {c:010} {d:010}]");
    assert!(
        text.contains(&expected),
        "the document must carry the ranges it reports"
    );
}

#[test]
fn the_original_bytes_are_untouched_and_the_result_still_parses() {
    let original = simple_pdf();
    let prepared = prepared(&original);
    assert!(prepared.bytes().starts_with(&original));

    let doc = PdfDocument::parse(prepared.bytes()).expect("the extended file parses");
    let catalog = doc.dict_at(doc.catalog_number()).expect("catalog");
    let form = catalog
        .get_ref(b"AcroForm", "form")
        .expect("parses")
        .expect("present");
    let form = doc.dict_at(form.number).expect("form dictionary");
    assert_eq!(form.get(b"SigFlags"), Some(b"3".as_slice()));
}

#[test]
fn the_widget_joins_a_page_that_already_has_annotations() {
    let original = pdf_with_annots();
    let prepared = prepared(&original);
    let doc = PdfDocument::parse(prepared.bytes()).expect("parses");
    let page = doc.dict_at(2).expect("page");
    let annots = page.get(b"Annots").expect("the page keeps its annotations");
    let text = String::from_utf8_lossy(annots).to_string();
    assert!(
        text.starts_with("[4 0 R "),
        "the existing annotation survives: {text}"
    );
    assert!(text.ends_with(" 0 R]"), "the widget is appended: {text}");
    // The page's other keys are carried through unchanged.
    assert_eq!(page.get(b"MediaBox"), Some(b"[0 0 595 842]".as_slice()));
}

#[test]
fn a_document_that_already_has_a_form_is_rejected_by_name() {
    let original = crate::testkit::build_pdf(
        &[
            (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
            (2, "<</Type/Page/Parent 1 0 R>>"),
            (3, "<</Type/Catalog/Pages 1 0 R/AcroForm 4 0 R>>"),
            (4, "<</Fields[]>>"),
        ],
        3,
    );
    assert_eq!(
        append_signature_placeholder(&original, &PlaceholderOptions::default()).expect_err("fails"),
        SigningError::Unsupported {
            what: "a document that already carries an interactive form (/AcroForm)",
        }
    );
}

#[test]
fn a_page_whose_annotations_are_indirect_is_rejected_by_name() {
    let original = crate::testkit::build_pdf(
        &[
            (1, "<</Type/Pages/Count 1/Kids[2 0 R]>>"),
            (2, "<</Type/Page/Parent 1 0 R/Annots 4 0 R>>"),
            (3, "<</Type/Catalog/Pages 1 0 R>>"),
            (4, "[]"),
        ],
        3,
    );
    assert_eq!(
        append_signature_placeholder(&original, &PlaceholderOptions::default()).expect_err("fails"),
        SigningError::Unsupported {
            what: "a page whose /Annots is an indirect reference rather than an array",
        }
    );
}

#[test]
fn a_catalog_that_is_its_own_page_is_rejected_by_name() {
    // The page walk arrives back at the catalog: rewriting both under one
    // object number would silently drop whichever rewrite loses.
    let original = crate::testkit::build_pdf(&[(1, "<</Type/Page/Pages 1 0 R>>")], 1);
    assert_eq!(
        append_signature_placeholder(&original, &PlaceholderOptions::default()).expect_err("fails"),
        SigningError::Unsupported {
            what: "a page tree whose first page is the catalog object itself",
        }
    );
}

#[test]
fn a_document_that_cannot_be_read_never_reaches_the_writer() {
    assert_eq!(
        append_signature_placeholder(b"not a pdf", &PlaceholderOptions::default())
            .expect_err("fails"),
        SigningError::NotAPdf
    );
}

#[test]
fn preparing_the_same_document_twice_is_byte_identical() {
    let original = simple_pdf();
    assert_eq!(
        prepared(&original).into_bytes(),
        prepared(&original).into_bytes()
    );
}

#[test]
fn byte_range_arithmetic_is_checked_at_the_integer_maximum() {
    // The window's positions come from a parsed document, so every one of
    // these shapes has to fail rather than wrap into a range that claims to
    // cover more than the file holds.
    assert_eq!(compute_byte_range(100, 10, 20), Ok([0, 10, 20, 80]));
    assert_eq!(compute_byte_range(100, 100, 100), Ok([0, 100, 100, 0]));
    for (total, start, end) in [
        (100, 30, 20),
        (100, 10, 101),
        (100, usize::MAX, usize::MAX),
        (usize::MAX, usize::MAX, usize::MAX - 1),
    ] {
        assert!(
            matches!(
                compute_byte_range(total, start, end),
                Err(SigningError::OutOfRange { .. })
            ),
            "total {total} start {start} end {end} must be refused"
        );
    }
    assert_eq!(
        compute_byte_range(usize::MAX, 1, usize::MAX),
        Ok([0, 1, usize::MAX, 0])
    );
}

#[test]
fn a_range_too_large_for_the_fixed_fields_is_refused() {
    assert!(render_byte_range([0, 1, 2, 3]).is_ok());
    assert!(matches!(
        render_byte_range([0, 1, 2, crate::limits::MAX_FIXED_WIDTH_OFFSET + 1]),
        Err(SigningError::OutOfRange {
            what: "a /ByteRange field",
            ..
        })
    ));
}
