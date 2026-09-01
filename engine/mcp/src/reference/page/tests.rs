//! Front-matter parsing, over the real pages and over the malformed inputs
//! the real tree cannot produce.
//!
//! The degrade paths are exercised DIRECTLY here rather than through the
//! catalog: `super::super::tests` pins that every embedded page parses, so
//! the only way to reach a `None` is to hand `parse` the input itself.

use super::*;

/// A synthetic page, given the `'static` lifetime the real embedded ones
/// have. Leaked deliberately: a test process is the whole lifetime.
fn leaked(source: String) -> &'static str {
    Box::leak(source.into_boxed_str())
}

/// One embedded page's source, by stem.
fn embedded(stem: &str) -> &'static str {
    crate::reference::embed::PAGES
        .iter()
        .find(|p| p.stem == stem)
        .expect("embedded page")
        .source
}

/// A well-formed page, for the cases that vary one thing about it.
const GOOD: &str =
    "---\nreference:\n  group: item\n  summary: \"A thing.\"\n---\n\n# A thing\n\nBody.\n";

#[test]
fn a_real_page_parses_into_its_four_fields() {
    let page = parse("box", embedded("box")).expect("box parses");
    assert_eq!(page.stem, "box");
    assert_eq!(page.group, "item-keys");
    assert!(page.summary.starts_with("Position, size, margin"));
    assert_eq!(
        page.shapes,
        ["OptBox", "BoxType", "EdgeSpec", "EdgeValue", "EdgeMapRepr"]
    );
    assert!(page.title.starts_with("`box`"));
    assert!(page.body.starts_with("# `box`"));
}

#[test]
fn shapes_default_to_empty_when_the_page_declares_none() {
    let page = parse("rect", GOOD).expect("parses");
    assert!(page.shapes.is_empty());
    assert_eq!(page.title, "A thing");
    assert_eq!(page.body, "# A thing\n\nBody.\n");
}

#[test]
fn unknown_front_matter_keys_are_ignored() {
    // `order` and `keys` are the reference's own editorial fields; this
    // module is a reader of someone else's file, not its owner.
    let with_extras = GOOD.replace(
        "  group: item\n",
        "  group: item\n  order: 3\n  keys: [rect]\n",
    );
    assert!(parse("rect", leaked(with_extras)).is_some());
}

#[test]
fn a_page_without_parseable_front_matter_is_dropped() {
    for broken in [
        "# No front matter at all\n",
        "---\nnot the reference block\n---\n\n# Title\n",
        "---\nreference:\n  group: item\n---\n\n# No summary\n",
        "---\nreference:\n  summary: \"No group.\"\n---\n\n# Title\n",
        "---\nreference: [not, a, map]\n---\n\n# Title\n",
        "---\nreference:\n  group: item\n  summary: \"Unterminated.\"\n\n# Title\n",
    ] {
        assert!(
            parse("x", broken).is_none(),
            "expected a drop for {broken:?}"
        );
    }
}

#[test]
fn a_blank_summary_is_not_a_summary() {
    let blank = GOOD.replace("\"A thing.\"", "\"   \"");
    assert!(parse("x", leaked(blank)).is_none());
}

#[test]
fn a_page_without_an_h1_is_dropped() {
    for body in ["\n## Only an H2\n", "\nJust prose.\n", "\n#Not a heading\n"] {
        let page = GOOD.replace("\n\n# A thing\n\nBody.\n", body);
        assert!(
            parse("x", leaked(page)).is_none(),
            "expected a drop for {body:?}"
        );
    }
    // An empty heading is not a title either.
    let empty = GOOD.replace("# A thing\n", "# \n");
    assert!(parse("x", leaked(empty)).is_none());
}

#[test]
fn the_body_keeps_every_byte_after_the_front_matter() {
    // Only the fence and the blank line separating it from the body are
    // taken; a `---` INSIDE the body survives.
    let with_rule = "---\nreference:\n  group: item\n  summary: \"S\"\n---\n\n# T\n\na\n---\nb\n";
    let page = parse("x", with_rule).expect("parses");
    assert_eq!(page.body, "# T\n\na\n---\nb\n");
    assert!(with_rule.ends_with(page.body));
}
