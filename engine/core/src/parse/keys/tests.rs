//! The template key check: a non-string key is refused before the typed parse
//! can misread it as a field number, wherever it sits, and the refusal never
//! quotes a composite key back.

use crate::error::CoreError;
use crate::template::{parse_template, Template, MAX_CONTAINER_DEPTH};

const TEXT: &str = "{ type: text, text: x }";

fn body(item: &str) -> String {
    format!("sections:\n  body:\n    type: flow\n    items: [ {item} ]\n")
}

/// `depth` containers, each holding the next under the key `5:` — the field
/// number of `ContainerItem::items`.
fn chain_via_5(depth: usize) -> String {
    let mut item = TEXT.to_owned();
    for _ in 0..depth {
        item = format!("{{ type: container, 5: [ {item} ] }}");
    }
    item
}

/// The refusal's `(path, message)`, asserting it is the key check's.
fn refusal(yaml: &str) -> (String, String) {
    match parse_template(yaml).expect_err("must refuse") {
        CoreError::Located {
            what: "template",
            path,
            key: None,
            line: 0,
            column: 0,
            message,
        } if message.as_str().contains("is not a string") => {
            (path.as_str().to_owned(), message.as_str().to_owned())
        }
        other => panic!("not the key refusal: {other:?}"),
    }
}

#[test]
fn a_field_number_is_refused_where_it_would_have_been_read_as_items() {
    // Each of these parsed, with the list read as `items:`, before the check:
    // the key is that field's position in the buffered struct.
    for (yaml, path) in [
        (body(&chain_via_5(1)), "sections.body.items[0]"),
        (
            format!("sections:\n  body:\n    type: flow\n    2: [ {TEXT} ]\n"),
            "sections.body",
        ),
        (
            format!("sections:\n  body:\n    type: absolute\n    0: [ {TEXT} ]\n"),
            "sections.body",
        ),
    ] {
        let (at, message) = refusal(&yaml);
        assert_eq!(at, path, "{yaml}");
        assert!(message.contains("mapping key `"), "{message}");
    }
}

#[test]
fn a_chain_spelled_through_a_field_number_is_refused_not_read() {
    // Past the cap, this chain parsed: the nesting bound counts `items:`.
    refusal(&body(&chain_via_5(MAX_CONTAINER_DEPTH + 1)));
    // As deep as serde_yaml lets the shape go, it overflowed a test-sized
    // stack and aborted the process. An abort takes the whole test binary
    // down, so a regression here is loud rather than a failed assertion.
    let deepest = body(&chain_via_5(61));
    let result = std::thread::Builder::new()
        .stack_size(2 << 20)
        .spawn(move || parse_template(&deepest).map(|_: Template| ()))
        .expect("spawn")
        .join()
        .expect("no panic");
    assert!(
        matches!(&result, Err(CoreError::Located { message, .. }) if message.as_str().contains("is not a string")),
        "{result:?}"
    );
}

#[test]
fn every_kind_of_non_string_key_is_refused_and_named() {
    for (key, named) in [
        ("5", "`5`"),
        ("-1", "`-1`"),
        ("1.5", "`1.5`"),
        ("true", "`true`"),
        ("null", "`null`"),
        ("!n 7", "`7`"),
        ("? [a, b]\n  ", "a sequence"),
        ("? { a: b }\n  ", "a mapping"),
    ] {
        let yaml = format!("name: x\nstyles:\n  {key}: {{}}\n{}", body(TEXT));
        let (path, message) = refusal(&yaml);
        assert_eq!(path, "styles", "{key}");
        assert!(
            message.contains(&format!("mapping key {named} ")),
            "{key}: {message}"
        );
    }
}

#[test]
fn a_key_on_the_root_is_refused_with_the_empty_path() {
    let (path, _) = refusal(&format!("5: x\n{}", body(TEXT)));
    assert_eq!(path, "");
}

#[test]
fn a_quoted_or_tagged_name_is_a_string() {
    // The check is about what the key IS, not what it spells: `"5"` names a
    // style like any other.
    let template = parse_template(&format!(
        "styles:\n  \"5\": {{ fontSize: 9 }}\n{}",
        body(TEXT)
    ));
    assert!(template.expect("parses").styles.contains_key("5"));
    // A tag changes nothing about a key; whether the typed parse takes a
    // tagged one is its own business, so this asks the check alone.
    let raw: serde_yaml::Value = serde_yaml::from_str("a: { !t named: 1 }").expect("yaml");
    super::template(&raw).expect("a tagged string is a string");
}

#[test]
fn a_composite_key_is_named_by_kind_never_quoted() {
    let secret = "s".repeat(4096);
    let yaml = format!("styles:\n  ? [ {secret} ]\n  : {{}}\n{}", body(TEXT));
    let (_, message) = refusal(&yaml);
    assert!(!message.contains("sss"), "{message}");
}

#[test]
fn the_refusal_is_a_located_parse_error() {
    let err = parse_template(&body(&chain_via_5(1))).expect_err("refused");
    let diag = err.to_diagnostic();
    assert_eq!(diag.code, "parse_error");
    assert_eq!(diag.path.as_deref(), Some("sections.body.items[0]"));
    assert!(
        err.to_string().starts_with(
            "failed to parse template at `sections.body.items[0]`: mapping key `5` is not a string"
        ),
        "{err}"
    );
}
