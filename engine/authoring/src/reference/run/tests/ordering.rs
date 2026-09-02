//! The order, and the two claims it now carries.
//!
//! The fixture spans BOTH pages the spec names. That is load-bearing: the
//! all-or-nothing claim is about an EARLIER page not being written, and a
//! page the spec does not walk cannot express it.

use super::{assert_landed, spliceable, with_code, Tree, FIRST};
use crate::reference::run::{run, Job, Refusal};
use crate::reference::tables::CLOSE;

/// The happy path — and the CONTROL every refusal leans on. Without it,
/// "the catalog was not written" is an assertion that cannot fail.
#[test]
fn a_clean_tree_writes_the_catalog_and_splices_the_page() {
    let tree = Tree::new("clean");
    tree.seed();

    let outcome = tree.run().expect("a clean fixture regenerates");

    assert!(tree.catalog.exists(), "the catalog was written");
    // BOTH, not just the catalog: the requirement says the outcome names what
    // it wrote, and a catalog-only assertion is satisfied by a run that
    // silently skips every page.
    assert!(
        outcome.written.iter().any(|p| p == &tree.catalog),
        "the outcome names the catalog: {:?}",
        outcome.written
    );
    for stem in [FIRST, "probe"] {
        assert!(
            outcome.written.iter().any(|p| p
                .file_name()
                .is_some_and(|n| n == format!("{stem}.md").as_str())),
            "the outcome names {stem}.md: {:?}",
            outcome.written
        );
        let page = tree.read(&format!("{stem}.md"));
        assert!(page.contains("| `format` |"), "table spliced:\n{page}");
        assert!(!page.contains("placeholder"), "the block was replaced");
    }
}

/// The residual this cycle exists for: the hand-written sections are audited
/// BEFORE anything is written, so a page naming a retired code stops the run
/// with the tree untouched rather than after a partial rewrite.
#[test]
fn a_stale_code_refuses_before_the_catalog_is_written() {
    let tree = Tree::new("stale-code");
    tree.seed();
    let before = with_code("no_such_code_here");
    assert_landed(&before, "`no_such_code_here`");
    tree.page("probe.md", &before);

    let refusal = tree.run().expect_err("a stale code refuses");

    assert!(matches!(refusal, Refusal::Pages(_)), "got {refusal:?}");
    assert!(
        !tree.catalog.exists(),
        "the catalog must not exist: the audit runs BEFORE the first write"
    );
    assert_eq!(
        tree.read("probe.md"),
        before,
        "the page is byte-identical to what was written"
    );
    assert!(refusal.to_string().contains("nothing was written"));
}

/// The generalisation auditing-first did not cover on its own: a page whose
/// TABLES cannot be rendered used to abort the loop part-way, leaving exactly
/// the half-regenerated tree the ordering rule exists to prevent.
#[test]
fn an_unrenderable_page_writes_nothing_at_all() {
    let tree = Tree::new("bad-table");
    tree.seed();
    // `gamma` sorts BEFORE `probe` and the spec names BOTH, so under a
    // write-as-you-go implementation `gamma.md` would already be on disk when
    // `probe` fails — the half-regenerated tree D2 exists to prevent. That is
    // only expressible because the earlier page is one the spec walks; a page
    // outside the spec is never a write candidate under ANY implementation,
    // so asserting it unchanged proves nothing.
    let earlier = tree.read(&format!("{FIRST}.md"));
    assert!(
        !earlier.contains("| `format` |"),
        "the earlier page must be PENDING a splice, or the assertion below is \
         vacuous: writing it would not have changed it"
    );

    let broken = spliceable("Prose.").replace(&format!("{CLOSE}\n"), "");
    assert!(!broken.contains(CLOSE), "the sabotage removed the marker");
    tree.page("probe.md", &broken);

    let refusal = tree.run().expect_err("an unspliceable page refuses");

    assert!(matches!(refusal, Refusal::Tables { .. }), "got {refusal:?}");
    assert!(!tree.catalog.exists(), "the catalog must not exist");
    assert_eq!(
        tree.read("probe.md"),
        broken,
        "the failing page is unchanged"
    );
    assert_eq!(
        tree.read(&format!("{FIRST}.md")),
        earlier,
        "and the EARLIER page the spec names is byte-identical"
    );
    let text = refusal.to_string();
    assert!(text.contains("nothing was written"), "{text}");
    assert!(
        text.contains("probe.md"),
        "the refusal names the page: {text}"
    );
}

/// Its control: the same two-page fixture, unsabotaged, DOES write. Without
/// this the case above passes for a `run` that writes nothing ever.
#[test]
fn the_two_page_control_writes_when_nothing_is_sabotaged() {
    let tree = Tree::new("bad-table-control");
    tree.seed();

    let outcome = tree.run().expect("the unsabotaged fixture regenerates");

    assert!(tree.catalog.exists());
    assert_eq!(
        outcome.written.len(),
        3,
        "the catalog and BOTH spliced pages: {:?}",
        outcome.written
    );
}

/// WHICH refusal wins when two things are wrong at once is observable, and a
/// refactor that reorders the stages would change it silently — every
/// happy-path proof above passes either way. The audit is first, so a stale
/// code beats an unparseable spec.
#[test]
fn the_page_audit_refuses_before_the_spec_is_even_parsed() {
    let tree = Tree::new("precedence");
    tree.seed();
    tree.page("probe.md", &with_code("no_such_code_here"));

    let refusal = run(&Job {
        catalog: &tree.catalog,
        docs: &tree.docs,
        tables: "probe#keys: [this is not a table]",
    })
    .expect_err("both inputs are broken");

    assert!(
        matches!(refusal, Refusal::Pages(_)),
        "the audit wins, not the spec parse: {refusal:?}"
    );
    // The control: with the pages clean, the SAME bad spec is what refuses —
    // so this case really is discriminating between the two stages.
    tree.page("probe.md", &spliceable("Prose."));
    let refusal = run(&Job {
        catalog: &tree.catalog,
        docs: &tree.docs,
        tables: "probe#keys: [this is not a table]",
    })
    .expect_err("the spec is still broken");
    assert!(matches!(refusal, Refusal::Spec(_)), "got {refusal:?}");
}

/// A page the splice does not change is not rewritten, so a regeneration that
/// changes nothing reports nothing.
#[test]
fn an_already_current_page_is_not_rewritten() {
    let tree = Tree::new("idempotent");
    tree.seed();
    tree.run().expect("first run");
    let after_first = tree.read("probe.md");

    let outcome = tree.run().expect("second run");

    assert_eq!(tree.read("probe.md"), after_first, "byte-identical");
    assert_eq!(
        outcome.written,
        vec![tree.catalog.clone()],
        "only the catalog is written the second time"
    );
}
