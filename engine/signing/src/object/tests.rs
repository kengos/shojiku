//! Unit tests for the shallow dictionary model and the value scanner.

use super::*;
use crate::limits::{MAX_DICT_ENTRIES, MAX_NESTING_DEPTH};

fn span(buf: &[u8], scanned: (usize, usize)) -> &[u8] {
    buf.get(scanned.0..scanned.1).unwrap_or_default()
}

#[test]
fn scans_every_kind_of_value_as_a_raw_span() {
    let cases: &[(&[u8], &[u8])] = &[
        (b"/Name rest", b"/Name"),
        (b"  42 rest", b"42"),
        (b"-3.5 rest", b"-3.5"),
        (b"true rest", b"true"),
        (b"<0a1b> rest", b"<0a1b>"),
        (b"<</A 1/B 2>> rest", b"<</A 1/B 2>>"),
        (b"[1 2 3] rest", b"[1 2 3]"),
        (b"(a string) rest", b"(a string)"),
    ];
    for (input, expected) in cases {
        let scanned = scan_value(input, 0, 0).expect("scans");
        assert_eq!(span(input, scanned), *expected, "input {input:?}");
    }
}

#[test]
fn scans_an_indirect_reference_as_one_value() {
    let buf = b"12 0 R/Next";
    assert_eq!(span(buf, scan_value(buf, 0, 0).expect("scans")), b"12 0 R");
}

#[test]
fn stops_at_the_number_when_the_bytes_are_not_a_reference() {
    for buf in [b"12 0 X".as_slice(), b"12 x R".as_slice(), b"12".as_slice()] {
        assert_eq!(span(buf, scan_value(buf, 0, 0).expect("scans")), b"12");
    }
}

#[test]
fn a_string_may_contain_brackets_and_escapes() {
    let buf = br"(a \) and >> and (nested)) rest";
    assert_eq!(
        span(buf, scan_value(buf, 0, 0).expect("scans")),
        br"(a \) and >> and (nested))"
    );
}

#[test]
fn unterminated_values_are_located_failures() {
    for (buf, what) in [
        (b"<0a1b".as_slice(), "the end of a hexadecimal string"),
        (b"(unclosed".as_slice(), "the end of a literal string"),
        (b"[1 2".as_slice(), "the end of an array"),
    ] {
        assert_eq!(
            scan_value(buf, 0, 0).expect_err("fails"),
            SigningError::Malformed {
                offset: buf.len(),
                what
            }
        );
    }
}

#[test]
fn an_empty_buffer_and_a_stray_delimiter_are_failures() {
    assert!(matches!(
        scan_value(b"", 0, 0),
        Err(SigningError::Malformed { .. })
    ));
    assert_eq!(
        scan_value(b")", 0, 0).expect_err("fails"),
        SigningError::Malformed {
            offset: 0,
            what: "a value"
        }
    );
}

#[test]
fn nesting_is_capped_for_both_dictionaries_and_arrays() {
    let deep_array = format!(
        "{}{}",
        "[".repeat(MAX_NESTING_DEPTH + 2),
        "]".repeat(MAX_NESTING_DEPTH + 2)
    );
    assert_eq!(
        scan_value(deep_array.as_bytes(), 0, 0).expect_err("fails"),
        SigningError::LimitExceeded {
            what: "dictionary/array nesting",
            cap: MAX_NESTING_DEPTH
        }
    );
    let deep_dict = format!(
        "{}{}",
        "<</A ".repeat(MAX_NESTING_DEPTH + 2),
        ">>".repeat(MAX_NESTING_DEPTH + 2)
    );
    assert!(matches!(
        scan_value(deep_dict.as_bytes(), 0, 0),
        Err(SigningError::LimitExceeded { .. })
    ));
    assert!(matches!(
        scan_value(b"[1]", 0, MAX_NESTING_DEPTH + 1),
        Err(SigningError::LimitExceeded { .. })
    ));
}

#[test]
fn nesting_exactly_at_the_cap_is_still_accepted() {
    // A cap creates a boundary value, and the value AT it must work: a
    // parser that refuses what it documents as admissible is as wrong as one
    // that accepts what it documents as too deep.
    let at_cap = format!(
        "{}1{}",
        "[".repeat(MAX_NESTING_DEPTH),
        "]".repeat(MAX_NESTING_DEPTH)
    );
    let scanned = scan_value(at_cap.as_bytes(), 0, 0).expect("scans at the cap");
    assert_eq!(span(at_cap.as_bytes(), scanned), at_cap.as_bytes());
    // At the cap itself a scalar still scans. A container there would put its
    // elements one level deeper, which is where the refusal starts.
    assert!(scan_value(b"1", 0, MAX_NESTING_DEPTH).is_ok());
    assert!(matches!(
        scan_value(b"[1]", 0, MAX_NESTING_DEPTH),
        Err(SigningError::LimitExceeded { .. })
    ));
}

#[test]
fn a_dictionary_exactly_at_the_entry_cap_is_still_accepted() {
    let mut source = String::from("<<");
    for index in 0..MAX_DICT_ENTRIES {
        source.push_str(&format!("/K{index} {index}"));
    }
    source.push_str(">>");
    let dict = Dict::parse(source.as_bytes(), 0).expect("parses at the cap");
    assert_eq!(dict.entries.len(), MAX_DICT_ENTRIES);
}

#[test]
fn parses_a_dictionary_into_ordered_raw_entries() {
    let buf = b"<</Type /Catalog/Pages 1 0 R/Count 3>>";
    let dict = Dict::parse(buf, 0).expect("parses");
    assert_eq!(
        dict.entries,
        vec![
            (b"Type".as_slice(), b"/Catalog".as_slice()),
            (b"Pages".as_slice(), b"1 0 R".as_slice()),
            (b"Count".as_slice(), b"3".as_slice()),
        ]
    );
    assert_eq!(dict.get(b"Pages"), Some(b"1 0 R".as_slice()));
    assert_eq!(dict.get(b"Missing"), None);
    assert!(dict.has(b"Count") && !dict.has(b"Missing"));
}

#[test]
fn a_dictionary_needs_a_key_name_where_one_is_due() {
    assert_eq!(
        Dict::parse(b"<</A 1 2>>", 0).expect_err("fails"),
        SigningError::Malformed {
            offset: 7,
            what: "a key name or the end of the dictionary"
        }
    );
    assert_eq!(
        Dict::parse(b"[1]", 0).expect_err("fails"),
        SigningError::Malformed {
            offset: 0,
            what: "a dictionary"
        }
    );
}

#[test]
fn dictionary_entries_are_capped() {
    let mut source = String::from("<<");
    for index in 0..=MAX_DICT_ENTRIES {
        source.push_str(&format!("/K{index} {index}"));
    }
    source.push_str(">>");
    assert_eq!(
        Dict::parse(source.as_bytes(), 0).expect_err("fails"),
        SigningError::LimitExceeded {
            what: "dictionary entries",
            cap: MAX_DICT_ENTRIES
        }
    );
}

#[test]
fn typed_accessors_read_integers_and_references() {
    let dict = Dict::parse(b"<</Size 15/Root 14 0 R/Name /X>>", 0).expect("parses");
    assert_eq!(dict.get_uint(b"Size", "size"), Ok(Some(15)));
    assert_eq!(dict.get_uint(b"Absent", "size"), Ok(None));
    assert_eq!(
        dict.get_ref(b"Root", "root"),
        Ok(Some(ObjRef {
            number: 14,
            generation: 0
        }))
    );
    assert_eq!(dict.get_ref(b"Absent", "root"), Ok(None));
    assert!(dict.get_uint(b"Name", "size").is_err());
}

#[test]
fn parse_uint_rejects_trailing_content() {
    assert_eq!(parse_uint(b"42", "n"), Ok(42));
    assert_eq!(parse_uint(b" 42 ", "n"), Ok(42));
    assert_eq!(
        parse_uint(b"42 0 R", "n").expect_err("fails"),
        SigningError::Malformed {
            offset: 3,
            what: "n"
        }
    );
    assert!(parse_uint(b"/X", "n").is_err());
}

#[test]
fn parse_ref_requires_the_r_keyword_and_fitting_numbers() {
    assert_eq!(
        parse_ref(b"7 1 R", "r"),
        Ok(ObjRef {
            number: 7,
            generation: 1
        })
    );
    assert_eq!(
        parse_ref(b"7 1 X", "r").expect_err("fails"),
        SigningError::Malformed {
            offset: 4,
            what: "r"
        }
    );
    assert!(matches!(
        parse_ref(b"7 99999 R", "r"),
        Err(SigningError::OutOfRange { .. })
    ));
    assert!(matches!(
        parse_ref(b"99999999 0 R", "r"),
        Err(SigningError::OutOfRange { .. })
    ));
    assert!(parse_ref(b"/X", "r").is_err());
}

#[test]
fn object_numbers_are_capped() {
    assert_eq!(object_number(5, "n"), Ok(5));
    assert!(matches!(
        object_number(u64::from(u32::MAX), "n"),
        Err(SigningError::OutOfRange { .. })
    ));
    assert!(matches!(
        object_number(u64::MAX, "n"),
        Err(SigningError::OutOfRange { .. })
    ));
}

#[test]
fn array_elements_splits_on_value_boundaries() {
    assert_eq!(
        array_elements(b"[2 0 R 3 0 R]", "kids"),
        Ok(vec![b"2 0 R".as_slice(), b"3 0 R".as_slice()])
    );
    assert_eq!(array_elements(b"[]", "kids"), Ok(vec![]));
    assert_eq!(
        array_elements(b"[[1] (s)]", "kids"),
        Ok(vec![b"[1]".as_slice(), b"(s)".as_slice()])
    );
    assert_eq!(
        array_elements(b"5", "kids").expect_err("fails"),
        SigningError::Malformed {
            offset: 0,
            what: "kids"
        }
    );
}

mod spans;
