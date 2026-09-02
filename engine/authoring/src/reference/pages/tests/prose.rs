//! The third rule: a code-SHAPED name in the prose outside any section.
//!
//! Synthetic, like its neighbours — the real corpus is `committed`'s claim.
//! These fixtures deliberately put their tokens where the other two rules
//! cannot see them, so a pass here is about this rule alone.

use super::{messages, Words};
use crate::reference::pages::{audit, Problem};

/// Audits a whole page under `name`, so a test can choose whether the page is
/// in the third rule's scope.
fn run_as(name: &str, text: &str) -> Vec<Problem> {
    let words = Words::new();
    audit(&[(name, text)], &words.vocabulary()).0
}

/// The defect this rule exists for: `fonts.md` named a `FontError` tag in the
/// same backticked shape a diagnostic code takes, outside any section, and
/// nothing looked at it.
#[test]
fn a_code_shaped_unknown_in_the_prose_is_reported() {
    let problems = run_as("p.md", "# Title\n\nA face is rejected (`no_such_code`).\n");

    assert_eq!(
        messages(&problems),
        vec!["p.md: `no_such_code` is spelled like a diagnostic code and the engine defines no such code, capability key or wire word — reword it, or add it to the excused list with its reason"]
    );
}

/// Each of the three lookups accounts for a token on its own, so a real name
/// in the prose is not reported. Named per lookup rather than asserted as one
/// clean page: a single fixture cannot say WHICH clause accepted it.
#[test]
fn a_name_any_lookup_knows_is_not_reported() {
    for token in ["real_code", "vertical_rl"] {
        let problems = run_as("p.md", &format!("# T\n\nprose `{token}`\n"));
        assert!(
            problems.is_empty(),
            "`{token}` should be known: {problems:?}"
        );
    }
}

/// The shape is narrower than the second rule's underscore. A dotted
/// capability key and a `camelCase` wire key are out of reach BY SHAPE, which
/// is what keeps the rule from becoming an allowlist of the whole wire.
#[test]
fn only_a_code_shaped_name_is_judged() {
    for token in [
        "image.fit.not_a_key", // dotted: capability-key shape, not a code
        "flexBasis",           // no underscore at all
        "intro_Token",         // an uppercase word
        "_leading",            // a leading underscore
        "trailing_",           // a trailing one
        "double__underscore",  // an empty word between two
    ] {
        let problems = run_as("p.md", &format!("# T\n\nprose `{token}`\n"));
        assert!(
            problems.is_empty(),
            "`{token}` is not code-shaped and must not be judged: {problems:?}"
        );
    }
}

/// `features.md` is the capability and decision LOG, not a reference page —
/// it names Rust symbols, C ABI functions and MCP tool names in code shape by
/// design, and 35 of the 43 code-shaped unknowns in `docs/engine/` occur only
/// there.
#[test]
fn the_decision_log_is_out_of_scope() {
    let text = "# Features\n\nthe C ABI's `shojiku_abi_version` and `no_such_code`\n";

    assert!(
        run_as("features.md", text).is_empty(),
        "features.md is not read by this rule"
    );
    // The positive control: the SAME text on any other page IS read, so the
    // exemption is about the page and not about the tokens.
    assert_eq!(run_as("p.md", text).len(), 2);
}

/// A name on the excused list is dropped, and COUNTED — the count is what the
/// drift test holds against the list's length, so an excusal that stops being
/// needed reds rather than quietly masking a future real one.
#[test]
fn an_excused_name_is_dropped_and_counted() {
    let words = Words::new();
    // `deny_unknown_fields` is the serde attribute, excused by name. The
    // control beside it is a name that is NOT excused, so this case can fail.
    let text = "# T\n\nprose `deny_unknown_fields`\n";
    let (problems, census) = audit(&[("p.md", text)], &words.vocabulary());

    assert!(problems.is_empty(), "excused: {problems:?}");
    assert_eq!(census.outside, 1, "it was READ before it was excused");
    assert_eq!(census.excused, 1);
    assert_eq!(census.excused_names, 1);

    let control = "# T\n\nprose `deny_unknown_fieldz`\n";
    let (problems, census) = audit(&[("p.md", control)], &words.vocabulary());
    assert_eq!(problems.len(), 1, "one letter off is not excused");
    assert_eq!(census.excused, 0);
}

/// Being out of the THIRD rule's scope does not take `features.md` out of the
/// other two — its `## Diagnostics` section, if it grows one, is read like any
/// other page's.
#[test]
fn the_decision_log_is_still_read_by_the_first_two_rules() {
    let text = "# Features\n\n## Diagnostics\n\n| Code | Meaning |\n| --- | --- |\n| `no_such_code` | x |\n";

    let problems = run_as("features.md", text);

    assert_eq!(
        problems.len(),
        1,
        "the first rule still applies: {problems:?}"
    );
    assert!(matches!(problems[0], Problem::UnknownCode { .. }));
}

/// A heading is prose too. `diagnostics.md` writes `## Assets (`prepare_assets`)`,
/// and the section-tracking `continue` would otherwise skip the one line most
/// likely to carry a code-shaped name.
#[test]
fn a_heading_line_is_read() {
    let problems = run_as("p.md", "# T\n\n## Assets (`no_such_code`)\n\nbody\n");

    assert_eq!(problems.len(), 1, "the heading was read: {problems:?}");
}

/// Inside `## Diagnostics` the first two rules own the line, and this one must
/// not double-report what they already judged.
#[test]
fn the_diagnostics_section_belongs_to_the_other_rules() {
    let text = "# T\n\n## Diagnostics\n\nprose `no_such_code`\n";

    let problems = run_as("p.md", text);

    assert_eq!(problems.len(), 1, "reported once, not twice: {problems:?}");
    assert!(
        matches!(problems[0], Problem::UnknownToken { .. }),
        "by the SECOND rule: {problems:?}"
    );
}

/// A fenced sample is code, not a claim — the same rule the other two follow.
#[test]
fn a_fenced_sample_is_not_read() {
    let text = "# T\n\n```yaml\nkey: `no_such_code`\n```\n\nprose\n";

    assert!(run_as("p.md", text).is_empty());
}
