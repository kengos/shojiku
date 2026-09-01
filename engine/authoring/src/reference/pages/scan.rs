//! The scan itself: one pass over a page's lines.
//!
//! Split from [`super`] so the rule's SHAPE (what a problem is, what the
//! census counts, which three sets are consulted) stays readable on its own
//! and the walk that produces them lives beside its own invariants.
//!
//! Nothing here allocates per line beyond the tokens it finds, indexes any
//! byte it has not just located, or backtracks — so the cost is linear in the
//! page and a malformed page produces problems or nothing, never a panic.

use super::{Census, Problem, Vocabulary};
use std::collections::BTreeSet;

/// How much of a page-derived token a message may quote.
///
/// The corpus is committed rather than attacker-controlled, so
/// `shojiku_diagnostics::Echo` is not owed here — but the bound costs one line
/// and the alternative is a claim about who may write `docs/engine/`.
const MAX_ECHO: usize = 64;

/// The comment that exempts a line from the second rule, in the shape of the
/// repo's other waivers (`line-budget-exempt:`). The exemption surface is
/// EMPTY on the committed tree and the drift test pins it there.
const EXEMPT: &str = "diagnostics-token-exempt:";

/// One page: walk its lines, and read only what sits under a `## Diagnostics`
/// heading and outside a fenced block.
pub fn page(
    name: &str,
    text: &str,
    vocabulary: &Vocabulary<'_>,
    distinct: &mut BTreeSet<String>,
    census: &mut Census,
    out: &mut Vec<Problem>,
) {
    let mut inside = false;
    let mut fenced = false;
    let mut tabled = false;
    for line in text.lines() {
        // Fences FIRST, and tracked over the whole page: inside a fenced block
        // nothing is a heading and nothing is a table row, which is what stops
        // a markdown sample containing a `## ` line from silently closing the
        // section around it. A YAML sample naming a wire key is the other half
        // of the same rule.
        if line.trim_start().starts_with("```") {
            fenced = !fenced;
            continue;
        }
        if fenced {
            continue;
        }
        // Any `## ` closes the section; a `### ` sub-heading does not, which is
        // why this tests the h2 prefix rather than a bare `#`. The heading is
        // matched EXACTLY — a renamed one drops the page out of the audit, and
        // the pinned section count is what turns that into a failure.
        if line.starts_with("## ") {
            inside = line.trim_end() == "## Diagnostics";
            if inside {
                census.sections += 1;
            }
            continue;
        }
        if inside && one(name, line, vocabulary, distinct, census, out) {
            tabled = true;
        }
    }
    if tabled {
        census.tables += 1;
    }
}

/// One in-section line. Returns whether it was a table row naming a code.
fn one(
    name: &str,
    text: &str,
    vocabulary: &Vocabulary<'_>,
    distinct: &mut BTreeSet<String>,
    census: &mut Census,
    out: &mut Vec<Problem>,
) -> bool {
    let exempt = text.contains(EXEMPT);
    let Some(cells) = text.trim_start().strip_prefix('|') else {
        loose(name, text, vocabulary, census, out, exempt);
        return false;
    };
    // An unterminated row has no second bar; treating the remainder as column
    // 1 keeps a code claim under the STRICTER rule rather than demoting it.
    let (first, tail) = cells.split_once('|').unwrap_or((cells, ""));
    let codes = tokens(first);
    for code in &codes {
        census.occurrences += 1;
        census.tokens += usize::from(code.contains('_'));
        distinct.insert(code.clone());
        if !vocabulary.registry.contains(code) {
            out.push(Problem::UnknownCode {
                page: name.to_owned(),
                code: clip(code),
            });
        }
    }
    loose(name, tail, vocabulary, census, out, exempt);
    if codes.is_empty() {
        return false;
    }
    census.rows += 1;
    true
}

/// The second rule over one chunk of a line: everything outside column 1.
fn loose(
    name: &str,
    text: &str,
    vocabulary: &Vocabulary<'_>,
    census: &mut Census,
    out: &mut Vec<Problem>,
    exempt: bool,
) {
    for token in tokens(text) {
        if !token.contains('_') {
            continue;
        }
        census.tokens += 1;
        if exempt {
            census.exempt += 1;
            continue;
        }
        census.checked += 1;
        if !vocabulary.knows(&token) {
            out.push(Problem::UnknownToken {
                page: name.to_owned(),
                token: clip(&token),
            });
        }
    }
}

/// Every backticked identifier-shaped run in `text`.
///
/// Dots are admitted because a capability key is dotted; anything else inside
/// the backticks (a space, a colon, `%`) means the span is prose or a code
/// sample rather than a name, and is skipped.
fn tokens(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = text;
    while let Some(open) = rest.find('`') {
        let after = &rest[open + 1..];
        let Some(close) = after.find('`') else { break };
        let inner = &after[..close];
        if !inner.is_empty() && inner.chars().all(is_name_char) {
            out.push(inner.to_owned());
        }
        rest = &after[close + 1..];
    }
    out
}

fn is_name_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '.'
}

/// Bounds what a message quotes back from the page.
fn clip(token: &str) -> String {
    token.chars().take(MAX_ECHO).collect()
}
