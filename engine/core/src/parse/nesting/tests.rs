//! The template nesting bound: where it refuses, that its refusal is
//! validation's diagnostic, and that a hostile chain is refused rather than
//! read into the model on a small stack.

use crate::error::CoreError;
use crate::template::{parse_template, Template, MAX_CONTAINER_DEPTH};
use crate::validate;
use shojiku_diagnostics::Diagnostic;

const TEXT: &str = "{ type: text, text: x }";

/// `depth` containers, one inside the next, around `inner`.
fn chain(depth: usize, inner: &str) -> String {
    let mut item = inner.to_owned();
    for _ in 0..depth {
        item = format!("{{ type: container, items: [ {item} ] }}");
    }
    item
}

fn body(item: &str) -> String {
    format!("sections:\n  body:\n    type: flow\n    items: [ {item} ]\n")
}

/// The path validation reports for the container at `depth` of a body chain.
fn body_path(depth: usize) -> String {
    format!("sections.body.items[0]{}", ".items[0]".repeat(depth - 1))
}

fn refusal(yaml: &str) -> Diagnostic {
    let err = parse_template(yaml).expect_err("must refuse");
    assert!(matches!(err, CoreError::ContainerDepth { .. }), "{err:?}");
    err.to_diagnostic()
}

/// What validation says about the same document read WITHOUT the bound —
/// the only way a too-deep template can still reach it.
fn validated(yaml: &str) -> Diagnostic {
    let template: Template = serde_yaml::from_str(yaml).expect("unguarded");
    validate(None, &template, None)
        .iter()
        .find(|d| d.code == "container_depth_exceeded")
        .cloned()
        .expect("validation reports the depth")
}

#[test]
fn a_chain_at_the_cap_parses() {
    parse_template(&body(&chain(MAX_CONTAINER_DEPTH, TEXT))).expect("parses");
}

#[test]
fn one_container_past_the_cap_is_refused_as_validation_would() {
    let yaml = body(&chain(MAX_CONTAINER_DEPTH + 1, TEXT));
    let diag = refusal(&yaml);
    assert_eq!(diag.code, "container_depth_exceeded");
    assert_eq!(
        diag.path.as_deref(),
        Some(body_path(MAX_CONTAINER_DEPTH + 1).as_str())
    );
    let checked = validated(&yaml);
    assert_eq!(
        (&diag.args, &diag.message),
        (&checked.args, &checked.message)
    );
}

#[test]
fn every_holder_is_refused_with_validations_own_diagnostic() {
    let deep = chain(MAX_CONTAINER_DEPTH, TEXT);
    let past = chain(MAX_CONTAINER_DEPTH - 1, TEXT);
    let docs = [
        body(&chain(MAX_CONTAINER_DEPTH + 1, TEXT)),
        format!(
            "sections:\n  body:\n    type: absolute\n    items: [ {} ]\n",
            chain(MAX_CONTAINER_DEPTH + 1, TEXT)
        ),
        format!("sections:\n  header:\n    items: [ {} ]\n  body:\n    type: absolute\n", chain(MAX_CONTAINER_DEPTH + 1, TEXT)),
        format!("sections:\n  body:\n    type: absolute\n  footer:\n    items: [ {} ]\n", chain(MAX_CONTAINER_DEPTH + 1, TEXT)),
        body(&format!("{{ type: repeat, data: {{ key: rows }}, cell: {{ items: [ {deep} ] }} }}")),
        body(&format!("{{ type: repeat_flow, data: {{ key: rows }}, item: {{ items: [ {deep} ] }} }}")),
        body(&chain(
            MAX_CONTAINER_DEPTH,
            &format!("{{ type: table, data: {{ key: rows }}, columns: [ {{ label: a }}, {{ cell: {{ items: [ {TEXT} ] }} }} ] }}"),
        )),
        body(&format!(
            "{{ type: table, data: {{ key: rows }}, columns: [ {{ cell: {{ items: [ {} ] }} }} ] }}",
            chain(MAX_CONTAINER_DEPTH, TEXT)
        )),
        body(&chain(1, &format!("{{ type: repeat, data: {{ key: rows }}, cell: {{ items: [ {past} ] }} }}"))),
    ];
    for yaml in &docs {
        let (parsed, checked) = (refusal(yaml), validated(yaml));
        assert_eq!(parsed.path, checked.path, "{yaml}");
        assert_eq!(parsed.args, checked.args, "{yaml}");
        assert_eq!(parsed.severity, checked.severity, "{yaml}");
    }
}

#[test]
fn a_holder_with_no_items_list_is_left_to_validation() {
    // Nothing nests below it, so there is nothing for the typed parse to
    // recurse into — and validation still reports the depth.
    let yaml = body(&chain(MAX_CONTAINER_DEPTH, "{ type: container }"));
    let template = parse_template(&yaml).expect("parses");
    let diags = validate(None, &template, None);
    assert!(
        diags.iter().any(|d| d.code == "container_depth_exceeded"),
        "{diags:?}"
    );
}

#[test]
fn a_tag_does_not_hide_a_level() {
    let item = format!(
        "!box {{ type: container, items: !list [ {} ] }}",
        chain(MAX_CONTAINER_DEPTH, TEXT)
    );
    refusal(&body(&item));
}

#[test]
fn a_chain_under_an_item_that_takes_no_items_is_counted() {
    // `locate` re-reads every `items:` sequence it meets after a failed
    // parse, so a chain hidden under a text item is a chain it deserializes.
    let item = format!(
        "{{ type: text, text: x, items: [ {} ] }}",
        chain(MAX_CONTAINER_DEPTH, TEXT)
    );
    refusal(&body(&item));
}

#[test]
fn a_key_spelled_like_an_indexed_list_is_still_echoed() {
    // The structural test reads the index, not just the name before it: a
    // key `items[…` whose value is a list yields a segment that STARTS like
    // `items[0]` and would otherwise be kept whole, at any length.
    for key in [
        format!("items[{}", "k".repeat(400)),
        format!("items[{}]", "k".repeat(400)),
    ] {
        let item = format!(
            "{{ type: text, text: x, \"{key}\": [ {{ items: [ {} ] }} ] }}",
            chain(MAX_CONTAINER_DEPTH, TEXT)
        );
        let err = parse_template(&body(&item)).expect_err("must refuse");
        let CoreError::ContainerDepth { path, .. } = &err else { panic!("{err:?}") };
        assert!(path.as_str().ends_with('…'), "{key}: {path:?}");
    }
}

#[test]
fn a_path_through_an_unknown_key_is_echoed_not_kept_whole() {
    let key = "k".repeat(400);
    let item = format!(
        "{{ type: text, text: x, {key}: {{ items: [ {} ] }} }}",
        chain(MAX_CONTAINER_DEPTH, TEXT)
    );
    let err = parse_template(&body(&item)).expect_err("must refuse");
    let CoreError::ContainerDepth { path, .. } = &err else { panic!("{err:?}") };
    assert!(path.as_str().ends_with('…'), "{path:?}");
    assert!(
        err.to_string().contains("nest deeper than 32 levels"),
        "{err}"
    );
}

#[test]
fn non_string_keys_and_scalars_are_passed_over() {
    let yaml = format!("sections:\n  body:\n    type: flow\n    items: [ {TEXT} ]\n    1: [ 2 ]\n");
    let err = parse_template(&yaml).expect_err("the typed parse still refuses the key");
    assert!(!matches!(err, CoreError::ContainerDepth { .. }), "{err:?}");
}

/// Parses `yaml` on a thread the size of a test thread: enough for the
/// pass-1 parse of the deepest chain, not for the typed parse of it. An
/// overflow aborts the whole test binary, so a regression here is loud
/// rather than a failed assertion.
fn on_a_test_sized_stack(yaml: String) -> Result<Template, CoreError> {
    std::thread::Builder::new()
        .stack_size(2 << 20)
        .spawn(move || parse_template(&yaml))
        .expect("spawn")
        .join()
        .expect("no panic")
}

#[test]
fn the_deepest_chain_the_parser_accepts_is_refused_not_read() {
    // 61 containers is as deep as serde_yaml's own limit lets this shape go.
    let deepest = 61;
    for yaml in [
        body(&chain(deepest, TEXT)),
        format!("bogus: 1\n{}", body(&chain(deepest, TEXT))),
        body(&chain(deepest, "{ type: text, text: x, bogus: 1 }")),
        body(&format!(
            "{{ type: text, text: x, items: [ {} ] }}",
            chain(deepest - 1, TEXT)
        )),
    ] {
        let err = on_a_test_sized_stack(yaml).expect_err("refused");
        assert!(matches!(err, CoreError::ContainerDepth { .. }), "{err:?}");
    }
    let past_the_parser =
        on_a_test_sized_stack(body(&chain(deepest + 1, TEXT))).expect_err("refused");
    assert!(
        matches!(past_the_parser, CoreError::Parse(_)),
        "{past_the_parser:?}"
    );
}
