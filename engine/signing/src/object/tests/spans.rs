//! Unit tests for locating a value's byte range inside a dictionary.

use super::super::*;
use crate::error::SigningError;

#[test]
fn dict_value_span_locates_a_value_by_its_offsets() {
    // The verifier needs WHERE a value sits, not just what it holds: the
    // signed byte ranges are defined by the position of the `/Contents`
    // window.
    let buf = b"<</A 1/Contents <ABCD>/B 2>>";
    let span = dict_value_span(buf, 0, b"Contents")
        .expect("walks")
        .expect("the key is present");
    assert_eq!(buf.get(span.clone()), Some(b"<ABCD>".as_slice()));
    assert_eq!(span, 16..22);
}

#[test]
fn dict_value_span_reports_an_absent_key_as_none() {
    assert_eq!(dict_value_span(b"<</A 1>>", 0, b"Contents"), Ok(None));
}

#[test]
fn dict_value_span_takes_the_first_of_a_duplicated_key() {
    // Matches `Dict::get` and how a reader resolves a duplicate.
    let buf = b"<</K 1/K 2>>";
    let span = dict_value_span(buf, 0, b"K")
        .expect("walks")
        .expect("present");
    assert_eq!(buf.get(span), Some(b"1".as_slice()));
}

#[test]
fn dict_value_span_refuses_bytes_that_are_not_a_dictionary() {
    assert_eq!(
        dict_value_span(b"5", 0, b"K").expect_err("fails"),
        SigningError::Malformed {
            offset: 0,
            what: "a dictionary"
        }
    );
}
