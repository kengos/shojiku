//! Unit tests for the byte-scanning primitives.

use super::*;

#[test]
fn character_classes_follow_the_format() {
    assert!(is_whitespace(b' ') && is_whitespace(0) && is_whitespace(b'\r'));
    assert!(!is_whitespace(b'a'));
    assert!(is_delimiter(b'<') && is_delimiter(b'%') && is_delimiter(b'/'));
    assert!(!is_delimiter(b'a'));
    assert!(is_regular(b'a') && !is_regular(b' ') && !is_regular(b'['));
}

#[test]
fn skip_ws_passes_whitespace_and_comments() {
    assert_eq!(skip_ws(b"  \r\n x", 0), 5);
    assert_eq!(skip_ws(b"% a comment\nx", 0), 12);
    assert_eq!(skip_ws(b"x", 0), 0);
}

#[test]
fn skip_ws_stops_at_end_of_buffer_inside_a_comment() {
    assert_eq!(skip_ws(b"% unterminated", 0), 14);
    assert_eq!(skip_ws(b"   ", 0), 3);
}

#[test]
fn read_token_returns_the_regular_character_run() {
    assert_eq!(read_token(b"Type/X", 0), (b"Type".as_slice(), 4));
    assert_eq!(read_token(b"/X", 0), (b"".as_slice(), 0));
    assert_eq!(read_token(b"abc", 9), (b"".as_slice(), 9));
}

#[test]
fn expect_keyword_consumes_or_locates_the_failure() {
    assert_eq!(
        expect_keyword(b"  obj rest", 0, b"obj", "the obj keyword"),
        Ok(5)
    );
    assert_eq!(
        expect_keyword(b"  xyz", 0, b"obj", "the obj keyword"),
        Err(SigningError::Malformed {
            offset: 2,
            what: "the obj keyword"
        })
    );
}

#[test]
fn read_uint_reads_a_decimal_run() {
    assert_eq!(read_uint(b" 01234x", 0, "n"), Ok((1234, 6)));
}

#[test]
fn read_uint_rejects_a_missing_number() {
    assert_eq!(
        read_uint(b" /Name", 0, "an offset"),
        Err(SigningError::Malformed {
            offset: 1,
            what: "an offset"
        })
    );
}

#[test]
fn read_uint_rejects_a_value_past_the_integer_maximum() {
    // One past u64::MAX, still inside the digit cap.
    assert_eq!(
        read_uint(b"18446744073709551616", 0, "an offset"),
        Err(SigningError::OutOfRange {
            offset: 0,
            what: "an offset"
        })
    );
    assert_eq!(
        read_uint(b"18446744073709551615", 0, "an offset"),
        Ok((u64::MAX, 20))
    );
}

#[test]
fn read_uint_rejects_a_digit_run_past_the_cap() {
    let long = "0".repeat(MAX_INT_DIGITS + 1);
    assert_eq!(
        read_uint(long.as_bytes(), 0, "an offset"),
        Err(SigningError::OutOfRange {
            offset: 0,
            what: "an offset"
        })
    );
}

#[test]
fn offset_within_rejects_positions_outside_the_buffer() {
    assert_eq!(offset_within(b"abcd", 3, 0, "an offset"), Ok(3));
    assert_eq!(
        offset_within(b"abcd", 4, 7, "an offset"),
        Err(SigningError::OutOfRange {
            offset: 7,
            what: "an offset"
        })
    );
    assert_eq!(
        offset_within(b"abcd", u64::MAX, 7, "an offset"),
        Err(SigningError::OutOfRange {
            offset: 7,
            what: "an offset"
        })
    );
}
