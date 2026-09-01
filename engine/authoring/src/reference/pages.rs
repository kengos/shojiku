//! The rule that keeps a page's HAND-WRITTEN diagnostics section honest
//! against the engine's own registries.
//!
//! [`super::tables`] owns the tables assembled from a spec and spliced into a
//! page between markers. This owns the ones the pages still write themselves:
//! 22 of the 34 `docs/engine/` pages carry a `## Diagnostics` section holding a
//! `Code` table nothing generates, and a 23rd (`char_grid.md`) states its codes
//! as prose. The two mechanisms are disjoint on the bytes — measured, no splice
//! marker sits inside a `## Diagnostics` section — so a table is audited by
//! exactly one of them.
//!
//! **Two rules, and the second is what reaches the prose.**
//!
//! - Column 1 of a table inside the section is a CODE CLAIM: every backticked
//!   token there must be in the diagnostic-code registry, and nothing laxer is
//!   accepted, because a reader looks that column up in `diagnostics.md`.
//! - Everywhere else in the section, a backticked token CONTAINING AN
//!   UNDERSCORE must be a registry code, a capability key, or a word of the
//!   catalog's own vocabulary. The underscore is the scoping decision and it is
//!   exact rather than lucky: every registry code contains one (measured, no
//!   exceptions), so no code can slip past the filter, while the single-word
//!   wire vocabulary a sentence legitimately quotes — `overflow`, `strict`,
//!   `hidden` — is excluded by shape and needs no allowlist.
//!
//! **What the rules do NOT reach, said plainly.** Three things, and the third
//! is a consequence of the design rather than of the scoping.
//!
//! 1. The heading is matched EXACTLY, so a page that renames `## Diagnostics`
//!    drops out of the audit — which is why the census pins the section count
//!    and the drift test fails rather than quietly reading one page fewer.
//! 2. The second rule sees only underscore-bearing tokens. Of the 198 tokens
//!    the census pins, 174 are column-1 claims judged by the first rule and 24
//!    fall to the second; the single-word names beside them (`overflow`,
//!    `ellipse`, `checkbox`) are out of BOTH rules' reach. No CODE hides
//!    there, since every registry code has an underscore and a test says so,
//!    but a mistyped one-word capability key would.
//! 3. **A code claim written as PROSE rather than in a table is held only to
//!    the union.** The second rule accepts registry OR capabilities OR
//!    catalog, so a page that states its codes in a sentence — `char_grid.md`
//!    is the one that does — can name something that is a real capability key
//!    or wire value but no diagnostic code, and pass. A typo or a rename is
//!    still caught, because neither produces a token that lands in another
//!    registry; a collision is not. Holding prose to the registry alone would
//!    need a way to tell a code claim from a wire quote inside a sentence,
//!    which the underscore filter deliberately does not attempt.
//!
//! **Line-oriented, no regex crate, no new dependency.** The corpus is
//! committed markdown read through a `CARGO_MANIFEST_DIR`-rooted path, so this
//! is not the hostile-input posture — but the scan is one pass over the page's
//! bytes with no backtracking anyway, which is the property an `X( Y)*` regex
//! would have cost, and it indexes nothing it has not just found.

use std::collections::BTreeSet;
use std::fmt;

mod scan;
mod vocabulary;
pub use vocabulary::{catalog_vocabulary, Known};

/// One way a page's diagnostics section and the engine disagree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Problem {
    /// A code table's column 1 names a code the registry does not define — a
    /// typo, or a code renamed while the page kept the old spelling.
    UnknownCode { page: String, code: String },
    /// A token elsewhere in the section that is no registry code, no capability
    /// key and no word of the wire. The half a table-only rule cannot see:
    /// `char_grid.md` states nine codes as prose and has no table at all.
    UnknownToken { page: String, token: String },
}

impl fmt::Display for Problem {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnknownCode { page, code } => {
                write!(f, "{page}: the registry has no code `{code}`")
            }
            Self::UnknownToken { page, token } => write!(
                f,
                "{page}: `{token}` is no diagnostic code, capability key or wire word"
            ),
        }
    }
}

/// The population the audit READ, returned so a caller can assert it.
///
/// Mandatory rather than decoration. A scan that silently matched nothing
/// reports zero problems, which is indistinguishable from a clean tree — so
/// the proving count has to be of the INPUTS. The drift test pins every number
/// here, and an inert parser fails it.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Census {
    /// Pages handed in, whether or not they carry a section.
    pub pages: usize,
    /// `## Diagnostics` sections found.
    pub sections: usize,
    /// Pages whose section carries at least one table row naming a code.
    pub tables: usize,
    /// Table rows naming at least one code.
    pub rows: usize,
    /// Column-1 code occurrences — more than `rows`, because a grouped row
    /// names several codes in one cell.
    pub occurrences: usize,
    /// Distinct codes across every page.
    pub distinct: usize,
    /// Every underscore-bearing backticked token inside a section, column 1
    /// included — the whole population the two rules divide between them.
    pub tokens: usize,
    /// The second rule's own population: underscore-bearing tokens outside
    /// column 1, minus the exempted ones.
    pub checked: usize,
    /// Tokens skipped by a `diagnostics-token-exempt:` comment on their line.
    pub exempt: usize,
}

/// The three closed sets a diagnostics section may name in code shape.
///
/// Passed in rather than read here so the rule stays a pure function over its
/// values and every failure leg is reachable from a synthetic triple.
pub struct Vocabulary<'a> {
    /// Every wire code the engine can emit — `DiagnosticCode::ALL`.
    pub registry: &'a BTreeSet<String>,
    /// Every stable capability key — `CAPABILITIES`. Twelve pages carry a
    /// `Capability keys:` paragraph INSIDE the section, and on four of them it
    /// names a dotted key nothing else defines (`image.fit.cover_none`,
    /// `checkbox.auto_size`, `inspect.text_metrics`,
    /// `style.borderStyle.dashed_dotted`, `style.lineBreak.strict_loose`), so
    /// without this lookup the rule reds the committed tree.
    pub capabilities: &'a BTreeSet<String>,
    /// The catalog's own vocabulary: property names, `enum` values, `oneOf`
    /// discriminators, `$defs` shape names.
    ///
    /// Nineteen of those words carry an underscore (`vertical_rl`,
    /// `space_between`, `line_through`); five are also capability keys, so on
    /// the committed tree this clause covers no token the capability list does
    /// not. It is here for the sentence that quotes a wire VALUE — a class the
    /// other two sets cannot express — not because today's residue needs it.
    pub catalog: &'a BTreeSet<String>,
}

impl Vocabulary<'_> {
    /// Whether any of the three sets defines `token`.
    fn knows(&self, token: &str) -> bool {
        self.registry.contains(token)
            || self.capabilities.contains(token)
            || self.catalog.contains(token)
    }
}

/// Audits every page's `## Diagnostics` section, reporting both the
/// disagreements and the population that produced them.
///
/// `pages` is `(name, markdown)` — the caller reads them, so nothing here
/// touches the filesystem and no caller-supplied value can steer a read.
#[must_use]
pub fn audit(pages: &[(&str, &str)], vocabulary: &Vocabulary<'_>) -> (Vec<Problem>, Census) {
    let mut out = Vec::new();
    let mut census = Census {
        pages: pages.len(),
        ..Census::default()
    };
    let mut distinct = BTreeSet::new();
    for (name, text) in pages {
        scan::page(name, text, vocabulary, &mut distinct, &mut census, &mut out);
    }
    census.distinct = distinct.len();
    (out, census)
}

#[cfg(test)]
mod tests;
