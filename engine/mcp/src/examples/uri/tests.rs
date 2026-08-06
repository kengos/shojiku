//! The URI grammar, including every hostile shape it must refuse. These
//! are the boundary tests: nothing downstream ever sees a reference this
//! module rejected.

use super::*;

#[test]
fn parses_an_entry_reference() {
    assert_eq!(
        parse("shojiku://example/business/invoice-ja"),
        Some(Ref::Entry("business/invoice-ja"))
    );
}

#[test]
fn parses_a_file_reference() {
    assert_eq!(
        parse("shojiku://example/business/invoice-ja/templates.yml"),
        Some(Ref::File("business/invoice-ja", "templates.yml"))
    );
}

#[test]
fn formats_both_forms() {
    assert_eq!(
        entry_uri("presets/blank-a4"),
        "shojiku://example/presets/blank-a4"
    );
    assert_eq!(
        file_uri("presets/blank-a4", "params.json"),
        "shojiku://example/presets/blank-a4/params.json"
    );
}

#[test]
fn round_trips_what_it_formats() {
    let uri = file_uri("forms/rirekisho-ja", "definitions.yml");
    assert_eq!(
        parse(&uri),
        Some(Ref::File("forms/rirekisho-ja", "definitions.yml"))
    );
}

#[test]
fn rejects_a_foreign_scheme() {
    // The traversal that matters most: a path the server would otherwise
    // be asked to open.
    assert_eq!(parse("file:///etc/passwd"), None);
    assert_eq!(parse("https://example.com/x"), None);
    assert_eq!(parse("shojiku://reference/flex"), None);
    assert_eq!(parse("/etc/passwd"), None);
    assert_eq!(parse(""), None);
}

#[test]
fn rejects_relative_path_segments() {
    for hostile in [
        "shojiku://example/business/../../etc/passwd",
        "shojiku://example/../gallery.yml",
        "shojiku://example/./business",
        "shojiku://example/business/..",
        "shojiku://example/business/invoice-ja/..",
    ] {
        assert_eq!(parse(hostile), None, "should refuse {hostile}");
    }
}

#[test]
fn rejects_percent_encoded_traversal() {
    // `%` is outside the accepted charset, so an encoded `../` cannot be
    // smuggled past a decoder this module deliberately does not have.
    for hostile in [
        "shojiku://example/business/%2e%2e%2f%2e%2e%2fetc/passwd",
        "shojiku://example/%2e%2e/gallery.yml",
        "shojiku://example/business/invoice-ja/%2e%2e%2fparams.json",
    ] {
        assert_eq!(parse(hostile), None, "should refuse {hostile}");
    }
}

#[test]
fn rejects_control_characters_and_separators() {
    for hostile in [
        "shojiku://example/business/inv\u{0000}oice",
        "shojiku://example/business/inv\noice",
        "shojiku://example/business/inv\u{001b}[2Joice",
        "shojiku://example/business\\invoice-ja",
        "shojiku://example/business/invoice ja",
    ] {
        assert_eq!(parse(hostile), None, "should refuse {hostile:?}");
    }
}

#[test]
fn rejects_empty_and_overlong_segment_counts() {
    assert_eq!(parse("shojiku://example/"), None);
    assert_eq!(parse("shojiku://example/business"), None);
    assert_eq!(parse("shojiku://example/business/"), None);
    assert_eq!(parse("shojiku://example//invoice-ja"), None);
    assert_eq!(parse("shojiku://example/business/invoice-ja/"), None);
    // Deeper than any real reference goes.
    assert_eq!(parse("shojiku://example/a/b/c/d"), None);
}

#[test]
fn accepts_the_full_permitted_charset() {
    assert_eq!(
        parse("shojiku://example/a_B-9.x/Y-2_z.q"),
        Some(Ref::Entry("a_B-9.x/Y-2_z.q"))
    );
}
