//! Shared fixtures and an INDEPENDENT structural checker.
//!
//! The checker deliberately does not use this crate's parser: a suite that
//! verified the writer with the reader written beside it would pass on any
//! pair of mistakes that agree with each other. It re-reads the tail, the
//! cross-reference table and the object headers from raw bytes.
//!
//! Everything here works on BYTES. A rendered PDF holds compressed streams,
//! so decoding it as text first would substitute replacement characters and
//! silently change every offset the suite is about to assert on.

use std::path::PathBuf;

/// Reads a committed example's rendered output — real engine output, pinned
/// byte-identical by the examples gate.
pub fn example(relative: &str) -> Vec<u8> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../examples")
        .join(relative);
    std::fs::read(&path).unwrap_or_else(|error| panic!("reading {}: {error}", path.display()))
}

/// Every bundled shape the suite exercises: a single page without
/// annotations, a multi-page document whose pages carry link annotations,
/// and a dense form.
pub fn bundled_examples() -> Vec<(&'static str, Vec<u8>)> {
    [
        "business/receipt-ja/output.pdf",
        "business/catalog-ja/output.pdf",
        "forms/rirekisho-ja/output.pdf",
    ]
    .into_iter()
    .map(|name| (name, example(name)))
    .collect()
}

/// Position of the LAST occurrence of `needle`.
pub fn rfind_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .rposition(|window| window == needle)
}

/// Overwrites `needle`'s last occurrence with an equal-length `replacement`.
pub fn overwrite(bytes: &mut [u8], needle: &[u8], replacement: &[u8]) {
    assert_eq!(
        needle.len(),
        replacement.len(),
        "an in-place edit must not move any byte"
    );
    let at = rfind_bytes(bytes, needle).expect("the bytes to overwrite");
    bytes
        .get_mut(at..at + replacement.len())
        .expect("the window")
        .copy_from_slice(replacement);
}

/// Replaces `needle`'s last occurrence, which may change the file's length.
pub fn splice(bytes: &[u8], needle: &[u8], replacement: &[u8]) -> Vec<u8> {
    let at = rfind_bytes(bytes, needle).expect("the bytes to replace");
    let mut out = bytes.get(..at).expect("a prefix").to_vec();
    out.extend_from_slice(replacement);
    out.extend_from_slice(bytes.get(at + needle.len()..).expect("a suffix"));
    out
}

/// The byte offset the file's last `startxref` points at.
pub fn last_startxref(bytes: &[u8]) -> usize {
    let at = rfind_bytes(bytes, b"startxref").expect("a startxref keyword");
    let tail = bytes
        .get(at + b"startxref".len()..)
        .expect("bytes after startxref");
    String::from_utf8_lossy(tail)
        .split_whitespace()
        .next()
        .expect("an offset")
        .parse()
        .expect("a numeric offset")
}

/// Reads one cross-reference section, returning its in-use entries and the
/// text of its trailer. From the table onward a PDF is plain ASCII.
pub fn read_section(bytes: &[u8], at: usize) -> (Vec<(u32, usize)>, String) {
    let text = String::from_utf8_lossy(bytes.get(at..).expect("a section inside the file"));
    let body = text
        .strip_prefix("xref\n")
        .expect("a classic cross-reference table");
    let mut entries = Vec::new();
    let mut rest = body;
    while !rest.starts_with("trailer") {
        let (header, tail) = rest.split_once('\n').expect("a subsection header");
        let mut numbers = header.split_whitespace();
        let first: u32 = numbers
            .next()
            .expect("a first number")
            .parse()
            .expect("numeric");
        let count: usize = numbers.next().expect("a count").parse().expect("numeric");
        for index in 0..count {
            let entry = tail
                .get(index * 20..index * 20 + 20)
                .expect("a twenty-byte entry");
            if entry.get(17..18) == Some("n") {
                let offset: usize = entry
                    .get(..10)
                    .expect("ten digits")
                    .parse()
                    .expect("numeric");
                let number = first + u32::try_from(index).expect("a fitting index");
                entries.push((number, offset));
            }
        }
        rest = tail.get(count * 20..).expect("bytes after the subsection");
    }
    let trailer = rest
        .split("startxref")
        .next()
        .expect("a trailer")
        .to_string();
    (entries, trailer)
}

/// The `/Root` object number named by a trailer's text.
pub fn root_number(trailer: &str) -> u32 {
    trailer
        .split("/Root ")
        .nth(1)
        .expect("a /Root entry")
        .split_whitespace()
        .next()
        .expect("an object number")
        .parse()
        .expect("numeric")
}

/// Asserts every entry of the newest section resolves to the object header it
/// claims, and returns that section's trailer text.
pub fn check_newest_section(bytes: &[u8]) -> String {
    let (entries, trailer) = read_section(bytes, last_startxref(bytes));
    assert!(
        !entries.is_empty(),
        "the appended section describes at least one object"
    );
    for (number, offset) in entries {
        let expected = format!("{number} 0 obj");
        let found = bytes
            .get(offset..offset + expected.len())
            .expect("an offset inside the file");
        assert_eq!(
            found,
            expected.as_bytes(),
            "entry for object {number} must point at its own header"
        );
    }
    trailer
}
