//! Unit tests for the cross-reference table parser.

use super::*;
use crate::limits::MAX_XREF_ENTRIES;

fn parse(source: &str) -> Result<XrefSection<'_>> {
    let mut budget = MAX_XREF_ENTRIES;
    parse_section(source.as_bytes(), 0, &mut budget)
}

const TRAILER: &str = "trailer\n<</Size 3/Root 1 0 R>>";

#[test]
fn reads_in_use_entries_and_the_trailer() {
    let source = format!(
        "xref\n0 3\n0000000000 65535 f\r\n0000000017 00000 n\r\n0000000081 00000 n\r\n{TRAILER}"
    );
    let section = parse(&source).expect("parses");
    assert_eq!(section.entries, vec![(1, 17), (2, 81)]);
    assert_eq!(section.trailer.get_uint(b"Size", "size"), Ok(Some(3)));
}

#[test]
fn reads_several_subsections() {
    let source = format!(
        "xref\n0 1\n0000000000 65535 f\r\n4 2\n0000000017 00000 n\r\n0000000081 00000 n\r\n{TRAILER}"
    );
    let section = parse(&source).expect("parses");
    assert_eq!(section.entries, vec![(4, 17), (5, 81)]);
}

#[test]
fn accepts_the_other_lawful_entry_terminators() {
    // The format admits SP CR, SP LF and CR LF as an entry's two-byte
    // terminator, so all three appear here.
    let source = format!(
        "xref\n0 3\n0000000000 65535 f \r0000000017 00000 n \n0000000081 00000 n\r\n{TRAILER}"
    );
    let section = parse(&source).expect("parses");
    assert_eq!(section.entries, vec![(1, 17), (2, 81)]);
}

#[test]
fn a_cross_reference_stream_is_rejected_by_name() {
    let error = parse("12 0 obj\n<</Type/XRef>>\nstream\n").expect_err("fails");
    assert_eq!(
        error,
        SigningError::Unsupported {
            what: "a cross-reference stream (this release reads classic cross-reference tables)",
        }
    );
}

#[test]
fn an_unknown_entry_keyword_is_a_located_failure() {
    let error = parse("xref\n0 1\n0000000000 00000 x\r\ntrailer\n<<>>").expect_err("fails");
    assert_eq!(
        error,
        SigningError::Malformed {
            offset: 26,
            what: "an entry keyword (n or f)"
        }
    );
}

#[test]
fn a_missing_trailer_dictionary_is_a_failure() {
    let error = parse("xref\n0 1\n0000000000 65535 f\r\ntrailer\n[1]").expect_err("fails");
    assert_eq!(
        error,
        SigningError::Malformed {
            offset: 37,
            what: "a dictionary"
        }
    );
}

#[test]
fn an_entry_count_past_the_budget_is_refused_before_the_loop() {
    // The count comes from the file, so a hostile one is checked against the
    // remaining budget BEFORE it can drive a loop or an allocation.
    let source = format!("xref\n0 {} \n{TRAILER}", u64::MAX);
    let mut budget = MAX_XREF_ENTRIES;
    assert_eq!(
        parse_section(source.as_bytes(), 0, &mut budget).expect_err("fails"),
        SigningError::LimitExceeded {
            what: "cross-reference entries",
            cap: MAX_XREF_ENTRIES
        }
    );
}

#[test]
fn the_budget_is_spent_across_sections() {
    let source = format!("xref\n0 2\n0000000000 65535 f\r\n0000000017 00000 n\r\n{TRAILER}");
    let mut budget = 2;
    parse_section(source.as_bytes(), 0, &mut budget).expect("fits exactly");
    assert_eq!(budget, 0);
    assert!(matches!(
        parse_section(source.as_bytes(), 0, &mut budget),
        Err(SigningError::LimitExceeded { .. })
    ));
}

#[test]
fn an_object_number_that_overflows_the_integer_is_refused() {
    // The free entry advances the index without touching the object number,
    // so the addition that overflows is reached on the entry after it.
    let source = format!(
        "xref\n{} 2\n0000000000 65535 f\r\n0000000017 00000 n\r\n{TRAILER}",
        u64::MAX
    );
    assert_eq!(
        parse(&source).expect_err("fails"),
        SigningError::OutOfRange {
            offset: 5,
            what: "an entry's object number"
        }
    );
}

#[test]
fn an_object_number_past_the_cap_is_refused() {
    let source = format!("xref\n99999999 1\n0000000017 00000 n\r\n{TRAILER}");
    assert!(matches!(
        parse(&source),
        Err(SigningError::OutOfRange { .. })
    ));
}

#[test]
fn an_in_use_entry_with_a_non_zero_generation_is_refused() {
    // Objects are identified by (number, generation), and this crate
    // resolves on the number alone — which is only sound because every
    // accepted entry is generation zero. An entry claiming any other
    // generation is refused by name rather than silently matched.
    let source = format!("xref\n0 2\n0000000000 65535 f\r\n0000000017 00001 n\r\n{TRAILER}");
    assert_eq!(
        parse(&source).expect_err("fails"),
        SigningError::Unsupported {
            what: "a cross-reference entry with a non-zero generation number"
        }
    );
}

#[test]
fn a_free_entry_keeps_its_conventional_generation() {
    // The head free entry carries 65535 by convention and is never
    // resolved, so the generation rule applies to in-use entries only.
    let source = format!("xref\n0 2\n0000000000 65535 f\r\n0000000017 00000 n\r\n{TRAILER}");
    assert_eq!(parse(&source).expect("parses").entries, vec![(1, 17)]);
}
