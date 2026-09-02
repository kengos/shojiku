//! The third rule: a code-SHAPED name in the prose OUTSIDE any
//! `## Diagnostics` section.
//!
//! The other two rules read only inside that section, so a page that names a
//! retired or invented code anywhere else says it unchecked. `fonts.md` did
//! exactly that — twice, in the same backticked shape a diagnostic code takes,
//! for an identifier that is a `FontError` message tag and appears nowhere in
//! `diagnostics.md`. A reader who met it in a real error and looked it up
//! found nothing.
//!
//! **Why this is viable when a whole-page widening of rule 2 was measured and
//! rejected.** That measurement counted `features.md`, and 35 of its 43
//! unknown tokens occur ONLY there — the remaining 8 are exactly [`EXCUSED`]. `features.md` is the capability and
//! decision LOG, not a reference page — the MCP reference catalog already
//! excludes it for the same reason — and it names Rust API symbols, C ABI
//! functions and MCP tool names in code shape by design. Excluding it leaves
//! **8 tokens over 13 occurrences on the other 33 pages**, all read, all
//! legitimate: [`EXCUSED`] is that set, minus the one real defect.
//!
//! **The shape is narrower than rule 2's, and deliberately.** Rule 2 asks only
//! for an underscore, because inside a diagnostics section anything
//! underscored is plausibly a code. Out in the prose that would bill every
//! dotted capability key and every `camelCase_`-ish spelling, so this asks for
//! the shape a `DiagnosticCode` actually has: lowercase ASCII words joined by
//! single underscores, no dots. A dotted key is a capability key by spelling
//! and is not a code claim.

/// Pages this rule does not read, with the reason it does not.
///
/// One entry, and it is not an escape hatch: `features.md` is not part of the
/// reference the MCP surface serves, and it is the only page in
/// `docs/engine/` whose subject is the engine's own API surface.
pub(super) const OUTSIDE_THE_REFERENCE: &[&str] = &["features.md"];

/// Names that are spelled like a diagnostic code and are not one.
///
/// A list rather than per-line comments in the prose, for two reasons: the doc
/// set is the product and should not carry ten invisible waivers, and a list
/// can be held to the corpus. `no_excused_name_is_stale` asserts every entry
/// below still occurs, so an entry that stops being needed is a red test
/// rather than a mask that quietly grows.
pub(super) const EXCUSED: &[(&str, &str)] = &[
    ("deny_unknown_fields", "the serde attribute, named in prose"),
    (
        "font_embedding_restricted",
        "a `FontError` message tag, not a code — `fonts.md` says so where it uses it",
    ),
    ("format_catalog", "an MCP tool name"),
    ("get_example", "an MCP tool name"),
    ("get_reference", "an MCP tool name"),
    ("list_examples", "an MCP tool name"),
    ("list_reference", "an MCP tool name"),
    ("prepare_assets", "a pipeline stage, in a section heading"),
];

/// Whether this page's prose is read by the third rule.
pub(super) fn in_scope(page: &str) -> bool {
    !OUTSIDE_THE_REFERENCE.contains(&page)
}

/// Whether `token` is spelled the way a `DiagnosticCode` is spelled: lowercase
/// ASCII alphanumeric words joined by single underscores, at least two of them.
///
/// Rejects a leading or trailing underscore, a doubled one, any uppercase and
/// any dot — so `image.fit.cover_none` (a capability key) and `flexBasis` (a
/// wire key) are out of reach by shape, as they should be.
pub(super) fn code_shaped(token: &str) -> bool {
    // Written as one loop rather than "first word, then the rest": `split`
    // always yields at least one item, so the `let Some(first) = … else` form
    // carries an arm no input can reach — an uncoverable line under the 100%
    // gate, and a branch no test could ever justify.
    if !token.starts_with(|c: char| c.is_ascii_lowercase()) {
        return false;
    }
    let mut words = 0usize;
    for word in token.split('_') {
        words += 1;
        if word.is_empty() || !plain(word) {
            return false;
        }
    }
    words > 1
}

fn plain(word: &str) -> bool {
    word.chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
}

/// Whether [`EXCUSED`] names `token`.
pub(super) fn is_excused(token: &str) -> bool {
    EXCUSED.iter().any(|(name, _)| *name == token)
}
