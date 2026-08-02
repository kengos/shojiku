//! Appending to real rendered output: the structural claims a signature will
//! rest on, checked over the bundled examples' bytes.

use shojiku_signing::{
    append_signature_placeholder, PdfDocument, PlaceholderOptions, RevisionBuilder,
};

use crate::common::{bundled_examples, check_newest_section, example, last_startxref};

#[test]
fn a_prepared_example_is_still_a_valid_two_revision_document() {
    for (name, original) in bundled_examples() {
        let prepared = append_signature_placeholder(&original, &PlaceholderOptions::default())
            .unwrap_or_else(|error| panic!("{name}: {error}"));
        let bytes = prepared.bytes();

        assert!(
            bytes.starts_with(&original),
            "{name}: the original bytes must not move"
        );
        assert!(
            bytes.ends_with(b"%%EOF"),
            "{name}: the file ends with the marker"
        );
        PdfDocument::parse(bytes).unwrap_or_else(|error| panic!("{name}: re-parse: {error}"));

        let trailer = check_newest_section(bytes);
        assert!(
            trailer.contains("/Prev"),
            "{name}: the new trailer points back"
        );
        assert!(
            trailer.contains("/Root"),
            "{name}: the new trailer carries /Root"
        );
        assert!(
            trailer.contains("/ID"),
            "{name}: the new trailer carries /ID"
        );
    }
}

#[test]
fn the_byte_ranges_cover_exactly_the_file_minus_the_window() {
    for (name, original) in bundled_examples() {
        let prepared = append_signature_placeholder(&original, &PlaceholderOptions::default())
            .unwrap_or_else(|error| panic!("{name}: {error}"));
        let bytes = prepared.bytes();
        let [first_start, first_len, second_start, second_len] = prepared.byte_range();
        let window = prepared.contents_span();

        assert_eq!(first_start, 0, "{name}");
        assert_eq!(
            first_len, window.start,
            "{name}: the first range ends at the window"
        );
        assert_eq!(
            second_start, window.end,
            "{name}: the second range starts after it"
        );
        assert_eq!(
            second_start + second_len,
            bytes.len(),
            "{name}: and runs to the end"
        );
        assert_eq!(
            first_len + second_len + window.len(),
            bytes.len(),
            "{name}: every byte is either signed or inside the window"
        );

        // The window is the hexadecimal string itself, delimiters included.
        let reserved = bytes
            .get(window.clone())
            .expect("the window is inside the file");
        assert_eq!(reserved.first(), Some(&b'<'), "{name}");
        assert_eq!(reserved.last(), Some(&b'>'), "{name}");
        let before = bytes.get(..window.start).expect("bytes before the window");
        assert!(
            before.ends_with(b"/Contents "),
            "{name}: the window is /Contents' value"
        );
    }
}

#[test]
fn preparing_the_same_example_twice_produces_the_same_bytes() {
    let original = example("business/receipt-ja/output.pdf");
    let once = append_signature_placeholder(&original, &PlaceholderOptions::default())
        .expect("prepares")
        .into_bytes();
    let twice = append_signature_placeholder(&original, &PlaceholderOptions::default())
        .expect("prepares")
        .into_bytes();
    assert_eq!(
        once, twice,
        "the writer adds no time, randomness or ordering drift"
    );
}

#[test]
fn a_document_that_already_carries_revisions_can_be_extended_again() {
    // The third revision is what a verifier's range-coverage check needs to
    // construct: a signed document that someone appended to afterwards.
    let original = example("business/receipt-ja/output.pdf");
    let prepared = append_signature_placeholder(&original, &PlaceholderOptions::default())
        .expect("prepares")
        .into_bytes();
    let second_startxref = last_startxref(&prepared);

    let doc = PdfDocument::parse(&prepared).expect("parses two revisions");
    let mut builder = RevisionBuilder::new(&doc);
    let number = builder.allocate().expect("allocates");
    builder.set_object(number, b"<</Type/Marker>>".to_vec());
    let extended = builder.finish().expect("finishes").into_bytes();

    assert!(
        extended.starts_with(&prepared),
        "the third revision is appended, not merged"
    );
    PdfDocument::parse(&extended).expect("parses three revisions");
    let trailer = check_newest_section(&extended);
    assert!(
        trailer.contains(&format!("/Prev {second_startxref}")),
        "the newest trailer points at the second revision: {trailer}"
    );
}

#[test]
fn the_reserved_capacity_is_what_the_caller_asked_for() {
    let original = example("business/receipt-ja/output.pdf");
    for capacity in [512usize, 4096, 65536] {
        let options = PlaceholderOptions::with_contents_capacity(capacity).expect("valid");
        let prepared = append_signature_placeholder(&original, &options).expect("prepares");
        assert_eq!(
            prepared.contents_span().len(),
            capacity * 2 + 2,
            "two hexadecimal digits per byte, plus both delimiters"
        );
    }
}
