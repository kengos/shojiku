//! The other ways a run stops, and what it says when it does.

use super::{with_code, Tree};
use crate::reference::run::{run, Job, Refusal};

/// A spec that does not parse is a refusal like any other, and writes nothing.
#[test]
fn an_unparseable_spec_writes_nothing() {
    let tree = Tree::new("bad-spec");
    tree.seed();

    let refusal = run(&Job {
        catalog: &tree.catalog,
        docs: &tree.docs,
        tables: "probe#keys: [this is not a table]",
    })
    .expect_err("a bad spec refuses");

    assert!(matches!(refusal, Refusal::Spec(_)), "got {refusal:?}");
    assert!(!tree.catalog.exists(), "the catalog must not exist");
    assert!(refusal.to_string().contains("does not parse"));
}

/// A page the spec names but the tree does not carry stops the run before any
/// write, and says which file it wanted.
#[test]
fn a_missing_page_writes_nothing() {
    let tree = Tree::new("missing-page");
    tree.seed();
    // Remove ONE of the two pages the spec names, so the case is about a
    // missing page rather than about an empty tree.
    std::fs::remove_file(tree.docs.join("probe.md")).expect("remove the page");

    let refusal = tree.run().expect_err("a missing page refuses");

    assert!(matches!(refusal, Refusal::Io { .. }), "got {refusal:?}");
    assert!(!tree.catalog.exists(), "the catalog must not exist");
    assert!(
        refusal.to_string().contains("probe.md"),
        "names the page it wanted: {refusal}"
    );
}

/// An unreadable docs root is reported against the root, not swallowed.
#[test]
fn a_missing_docs_root_is_reported() {
    let tree = Tree::new("no-docs");
    let absent = tree.root.join("nowhere");

    let refusal = run(&Job {
        catalog: &tree.catalog,
        docs: &absent,
        tables: super::SPEC,
    })
    .expect_err("a missing docs root refuses");

    assert!(matches!(refusal, Refusal::Io { .. }), "got {refusal:?}");
    assert!(refusal.to_string().contains("nowhere"));
}

/// A directory whose name ends `.md` is the shape that turns a naive walk into
/// an `EISDIR` crash. It must refuse, not panic.
#[test]
fn a_directory_named_like_a_page_refuses_rather_than_panicking() {
    let tree = Tree::new("subdir");
    tree.seed();
    std::fs::create_dir_all(tree.docs.join("nested.md")).expect("a directory named like a page");

    let refusal = tree.run().expect_err("a directory is not a page");

    assert!(matches!(refusal, Refusal::Io { .. }), "got {refusal:?}");
}

/// The audit reads only `.md`, and the outcome reports the population it read
/// — a bare "no problems" is what an inert scan reports too.
#[test]
fn the_outcome_reports_the_population_the_audit_read() {
    let tree = Tree::new("census");
    tree.seed();
    tree.page("probe.md", &with_code("missing_glyph"));
    tree.page("notes.txt", "`no_such_code_here` — not markdown, not read.");

    let outcome = tree.run().expect("a clean fixture regenerates");

    assert_eq!(outcome.sections, 1, "one `## Diagnostics` section");
    assert_eq!(outcome.occurrences, 1, "one column-1 code claim");
}

/// Every refusal renders something a reader can act on. Checked by VALUE: a
/// `Display` printing only the variant name would satisfy a non-empty check.
#[test]
fn a_refusal_names_the_page_and_the_problem() {
    let tree = Tree::new("message");
    tree.seed();
    tree.page("probe.md", &with_code("no_such_code_here"));

    let text = tree.run().expect_err("refuses").to_string();

    assert!(text.contains("probe.md"), "names the page: {text}");
    assert!(
        text.contains("no_such_code_here"),
        "names the token: {text}"
    );
}
