//! Unit tests for the two-pass typed parse, and the cost of the template
//! walks over a long key above a long sequence.

use super::*;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
struct Doc {
    items: Vec<Item>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
struct Item {
    #[allow(dead_code)]
    name: String,
}

/// The two passes over a document with no bound of its own.
fn parse_checked<T: serde::de::DeserializeOwned>(input: &str) -> Result<T, CoreError> {
    typed(&read(input, "doc")?, "doc", |_| Ok(()))
}

#[test]
fn parses_valid_input() {
    let doc: Doc = parse_checked("items:\n  - name: a\n").expect("parse");
    assert_eq!(doc.items.len(), 1);
}

#[test]
fn unknown_key_error_carries_path_and_location() {
    let err = parse_checked::<Doc>("items:\n  - name: a\n    bogus: x\n").expect_err("must reject");
    // Plain structs (no tagged enum) keep the full path — the unknown
    // key is appended — and an accurate location.
    let CoreError::Located { path, line, .. } = &err else { panic!("{err:?}") };
    assert_eq!(path, "items[0].bogus");
    assert_eq!(*line, 3);
}

#[test]
fn non_finite_is_rejected_before_typed_parse() {
    // Guard order: the finiteness check runs on pass 1, so `.inf`
    // is a `NonFinite`, never a located type error.
    let err = parse_checked::<Doc>("items:\n  - name: .inf\n").expect_err("reject");
    assert!(matches!(err, CoreError::NonFinite("doc")), "got: {err:?}");
}

#[test]
fn malformed_yaml_surfaces_as_parse_error() {
    let err = parse_checked::<Doc>("items: [unterminated\n").expect_err("reject");
    assert!(matches!(err, CoreError::Parse(_)), "got: {err:?}");
}

/// Parses `yaml` as a template on another thread and gives up after a
/// deadline, so a walk that went quadratic again fails instead of hanging.
fn template_within_deadline(yaml: String) -> Result<crate::template::Template, CoreError> {
    let (send, recv) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        // The receiver is gone only after the deadline already failed.
        send.send(crate::template::parse_template(&yaml)).ok();
    });
    recv.recv_timeout(std::time::Duration::from_secs(60))
        .expect("the pass-1 walks finish in time")
}

#[test]
fn a_long_key_over_a_long_sequence_costs_the_walks_their_sum_not_product() {
    // Spelling the path at every node copied the 4 MiB key into each of the
    // million elements' paths: ~4 TB of copying, inside the input cap, which
    // no machine finishes within the deadline.
    let key = "k".repeat(4 << 20);
    let zeros = vec!["0"; 1_000_000].join(",");
    let body = "sections:\n  body:\n    type: flow\n    items: [ { type: text, text: x } ]\n";
    // The key walk runs over all of it before the refusal after it, whose
    // path is spelled as before.
    let refused = format!("? {key}\n: [{zeros}]\nstyles:\n  5: {{}}\n{body}");
    let err = template_within_deadline(refused).expect_err("refused");
    let CoreError::Located { path, .. } = &err else { panic!("{err:?}") };
    assert_eq!(path, "styles");
    // String keys only: the nesting walk crosses the sequence; the
    // re-locating pass does not, the unknown root key being no buffered node.
    let unknown = format!("{body}? {key}\n: [{zeros}]\n");
    let err = template_within_deadline(unknown).expect_err("unknown key");
    assert!(matches!(err, CoreError::Located { .. }), "{err:?}");
}
