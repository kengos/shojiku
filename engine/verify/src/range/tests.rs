//! Unit tests for the `/ByteRange` claim and the coverage rule.

use super::*;

/// A signature dictionary carrying `array` as its `/ByteRange`.
fn dict(array: &str) -> Dict<'_> {
    let source: &'static str = Box::leak(format!("<</ByteRange {array}>>").into_boxed_str());
    Dict::parse(source.as_bytes(), 0).expect("the fixture is a dictionary")
}

/// The window a document with `total` bytes would reserve at `start..end`.
fn window(start: usize, end: usize) -> Range<usize> {
    start..end
}

#[test]
fn a_well_formed_array_reads_as_four_offsets() {
    assert_eq!(
        parse_byte_range(&dict("[0 100 200 50]")),
        Ok([0, 100, 200, 50])
    );
}

#[test]
fn a_signature_without_a_byte_range_is_not_a_claim_to_check() {
    let empty = Dict::parse(b"<</Type /Sig>>", 0).expect("a dictionary");
    assert_eq!(
        parse_byte_range(&empty).expect_err("fails"),
        VerifyError::Malformed {
            what: "a /ByteRange entry in the signature dictionary"
        }
    );
}

#[test]
fn a_byte_range_of_the_wrong_length_is_refused() {
    for array in ["[0 100 200]", "[0 100 200 50 60]", "[]"] {
        assert_eq!(
            parse_byte_range(&dict(array)).expect_err("fails"),
            VerifyError::Malformed {
                what: "a /ByteRange array of exactly four fields"
            },
            "for {array}"
        );
    }
}

#[test]
fn a_negative_byte_range_field_is_refused_rather_than_wrapped() {
    // The field is read as an unsigned decimal, so `-1` fails here instead
    // of becoming an enormous length that would swallow the whole file.
    assert!(matches!(
        parse_byte_range(&dict("[0 -1 200 50]")),
        Err(VerifyError::Document(_))
    ));
}

#[test]
fn a_byte_range_field_that_is_not_a_number_is_refused() {
    assert!(matches!(
        parse_byte_range(&dict("[0 /Name 200 50]")),
        Err(VerifyError::Document(_))
    ));
}

#[test]
fn a_byte_range_that_is_not_an_array_is_refused() {
    assert!(matches!(
        parse_byte_range(&dict("5")),
        Err(VerifyError::Document(_))
    ));
}

#[test]
fn a_byte_range_field_at_the_integer_ceiling_saturates_into_a_failing_claim() {
    // It reads, because u64::MAX is a legal unsigned decimal — and then it
    // cannot satisfy any coverage equality or fit inside any buffer, which
    // is the point of saturating rather than erroring.
    let array = format!("[0 {} 200 50]", u64::MAX);
    let range = parse_byte_range(&dict(&array)).expect("reads");
    assert_eq!(range[1], usize::MAX);
    assert!(!check_coverage(range, &window(10, 26), 40).is_passed());
    assert_eq!(covered_bytes(b"AAAA", range), None);
}

#[test]
fn coverage_passes_when_the_ranges_are_the_file_minus_the_window() {
    assert_eq!(
        check_coverage([0, 10, 26, 14], &window(10, 26), 40),
        CheckOutcome::Passed
    );
}

#[test]
fn coverage_fails_when_the_range_does_not_start_at_the_file() {
    assert_eq!(
        check_coverage([1, 9, 26, 14], &window(10, 26), 40),
        CheckOutcome::failed("the signed range does not start at the beginning of the file")
    );
}

#[test]
fn coverage_fails_when_the_range_stops_short_of_the_window() {
    // The interior-gap forgery: everything else lines up, but bytes between
    // the first range and the signature were never signed.
    assert_eq!(
        check_coverage([0, 8, 26, 14], &window(10, 26), 40),
        CheckOutcome::failed("the signed range does not run up to the signature window")
    );
}

#[test]
fn coverage_fails_when_the_range_does_not_resume_after_the_window() {
    assert_eq!(
        check_coverage([0, 10, 28, 12], &window(10, 26), 40),
        CheckOutcome::failed(
            "the signed range does not resume immediately after the signature window"
        )
    );
}

#[test]
fn coverage_fails_when_the_file_continues_past_what_was_signed() {
    // The appended-revision forgery: a perfectly valid signature over a
    // document that grew afterwards.
    assert_eq!(
        check_coverage([0, 10, 26, 14], &window(10, 26), 400),
        CheckOutcome::failed("the signed range does not reach the end of the file")
    );
}

#[test]
fn coverage_fails_rather_than_wrapping_at_the_integer_maximum() {
    // Both accumulations are probed at the ceiling, each after its own
    // offset has already advanced — a wrapped sum could otherwise satisfy
    // the very equality it is meant to prove.
    assert_eq!(
        check_coverage([0, usize::MAX, 26, 14], &window(10, 26), 40),
        CheckOutcome::failed("the signed range does not run up to the signature window")
    );
    assert_eq!(
        check_coverage([0, 10, 26, usize::MAX], &window(10, 26), 40),
        CheckOutcome::failed("the second signed range runs past the end of the address space")
    );
    assert_eq!(
        check_coverage([1, usize::MAX, 26, 14], &window(10, 26), 40),
        CheckOutcome::failed("the signed range does not start at the beginning of the file")
    );
}

#[test]
fn covered_bytes_concatenates_the_two_ranges_in_order() {
    let pdf = b"AAAA<HH>BBBB";
    assert_eq!(covered_bytes(pdf, [0, 4, 8, 4]), Some(b"AAAABBBB".to_vec()));
}

#[test]
fn covered_bytes_declines_ranges_that_leave_the_document() {
    let pdf = b"AAAA<HH>BBBB";
    assert_eq!(covered_bytes(pdf, [0, 4, 8, 400]), None);
    assert_eq!(covered_bytes(pdf, [0, usize::MAX, 8, 4]), None);
}
