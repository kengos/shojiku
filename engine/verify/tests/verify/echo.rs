//! What a hostile document can get printed on someone's terminal.
//!
//! Both crates build their messages from `&'static str` and numbers, and the
//! `assert_errors_are_bounded!` invocation in each crate makes that
//! structural — an error type that owned a `String` would stop the build.
//! This is the behavioural half of the same decision: drive real hostile
//! documents through the whole surface and check that a marker planted in
//! the input never comes back out, in an error OR in a report.
//!
//! The marker matters more than the length bound. A message that grows is a
//! nuisance; a message that quotes the file is an injection channel into
//! whatever reads the log.

use shojiku_verify::{verify_document, TrustAnchors};

use crate::common::{anchors, bundled_examples, sign};

/// A byte run that appears nowhere in this repository except here, so
/// finding it in an error can only mean the input was echoed.
const MARKER: &str = "SHOJIKU-HOSTILE-MARKER-9c1f4a";

/// Longest message any of these surfaces may produce. Every variant is a
/// fixed string plus numbers, so the real values are well under this; the
/// bound is here to fail loudly if that ever stops being true.
const MAX_MESSAGE: usize = 512;

/// Documents that all carry [`MARKER`] somewhere a parser will read.
fn hostile_documents() -> Vec<Vec<u8>> {
    let signed = sign(&bundled_examples().remove(0).1, "rsa2048");
    let mut corrupted = signed.clone();
    // Overwrite a stretch inside the signature window with the marker: the
    // bytes reach the hexadecimal decoder, which rejects them.
    let at = find_window(&corrupted);
    corrupted.splice(at..at + MARKER.len(), MARKER.bytes());
    vec![
        MARKER.as_bytes().to_vec(),
        format!("%PDF-1.7\n{MARKER}\nstartxref\n999999\n%%EOF").into_bytes(),
        format!(
            "%PDF-1.7\n1 0 obj\n<</Type/{MARKER}>>\nendobj\n\
             trailer\n<</Size 2>>\nstartxref\n9\n%%EOF"
        )
        .into_bytes(),
        signed[..signed.len() / 3].to_vec(),
        corrupted,
    ]
}

/// The offset of the first byte inside the signature's `/Contents`
/// hexadecimal string.
///
/// Searched from the END: a page's content stream is also a `/Contents`
/// entry and comes first in a real document, while the signature lives in
/// the revision appended last.
fn find_window(signed: &[u8]) -> usize {
    let keyword = b"/Contents <";
    let at = signed
        .windows(keyword.len())
        .rposition(|slice| slice == keyword)
        .expect("a signed document carries a /Contents hexadecimal string");
    at + keyword.len()
}

#[test]
fn no_error_or_report_quotes_the_document_it_read() {
    let anchors = anchors("rsa2048");
    for document in hostile_documents() {
        let text = match verify_document(&document, &anchors) {
            Err(error) => error.to_string(),
            Ok(report) => serde_json::to_string(&report).expect("the report serializes"),
        };
        assert!(!text.contains(MARKER), "the input was echoed: {text}");
        assert!(text.len() <= MAX_MESSAGE, "an unbounded message: {text}");
    }
}

#[test]
fn a_trust_anchor_file_is_not_quoted_back_either() {
    let error = TrustAnchors::from_pem(MARKER.as_bytes()).expect_err("this is not PEM");
    let text = error.to_string();
    assert!(!text.contains(MARKER), "the anchor file was echoed: {text}");
    assert!(text.len() <= MAX_MESSAGE, "an unbounded message: {text}");
}
