//! Unit tests for the hand-written-section rule.
//!
//! Synthetic except for [`committed`], which is the opposite claim: that the
//! pages actually in `docs/engine/` still agree with the engine. Everything
//! else uses a three-word vocabulary so each failure leg is reachable.

mod boundaries;
mod committed;
mod degenerate;
mod rules;
mod vocabulary;

use super::{audit, Census, Problem, Vocabulary};
use std::collections::BTreeSet;

fn set(words: &[&str]) -> BTreeSet<String> {
    words.iter().map(|w| (*w).to_owned()).collect()
}

/// A synthetic triple — one word from each of the three closed sets, so a test
/// can tell WHICH lookup accepted a token.
struct Words {
    registry: BTreeSet<String>,
    capabilities: BTreeSet<String>,
    catalog: BTreeSet<String>,
}

impl Words {
    fn new() -> Self {
        Self {
            registry: set(&["real_code", "other_code"]),
            capabilities: set(&["image.fit.cover_none"]),
            catalog: set(&["vertical_rl"]),
        }
    }

    fn vocabulary(&self) -> Vocabulary<'_> {
        Vocabulary {
            registry: &self.registry,
            capabilities: &self.capabilities,
            catalog: &self.catalog,
        }
    }
}

/// Audits one page against [`Words`].
fn run(text: &str) -> (Vec<Problem>, Census) {
    let words = Words::new();
    audit(&[("p.md", text)], &words.vocabulary())
}

/// Wraps a body in a page whose intro and tail BOTH carry an unknown
/// underscore token outside the section — so every fixture doubles as a
/// section-boundary control: if either leaks in, the test reports it.
fn page(body: &str) -> String {
    format!("# Title\n\nintro `intro_token`\n\n## Diagnostics\n\n{body}\n\n## See also\n\ntail `tail_token`\n")
}

/// The messages, so a test asserts what a reader would actually see.
fn messages(problems: &[Problem]) -> Vec<String> {
    problems.iter().map(ToString::to_string).collect()
}
