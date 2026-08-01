//! Ruby (furigana) annotations on a text item: reading pairs matched
//! against the item's resolved content at layout time. Distinct from the
//! aozora *markup* parser in [`crate::ruby`] (char_grid's opt-in content
//! notation) — these pairs are template-authored structure, so bound user
//! data is never interpreted.

use serde::{Deserialize, Serialize};

/// One ruby annotation: `text` read over the first unconsumed occurrence
/// of `base` in the item's resolved content (entries apply in listed
/// order, non-overlapping, each search starting after the previous
/// match). Both are verbatim strings — no `{key}` interpolation — so a
/// reading can never be smuggled in through params. Both are bounded by
/// [`crate::ruby::MAX_RUBY_LEN`] chars (`ruby_entry_too_long`): the base
/// is a substring NEEDLE scanned over params-driven content, so its
/// length must not multiply the search cost. Honored on every text
/// surface — plain and `spans`, horizontal (readings above the base
/// runs) and vertical (readings right of the base runs).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RubyPair {
    /// The base run to annotate, matched verbatim against the resolved
    /// content. Empty or unmatched warns (`empty_ruby_entry` /
    /// `ruby_base_not_found`).
    pub base: String,
    /// The reading laid beside the base run, shrunk to fit its extent
    /// (4pt floor, past which `ruby_overflow` warns).
    pub text: String,
}

/// Maximum `ruby` entries one text item may list. Templates are
/// untrusted; each entry costs a substring search over the resolved
/// content per layout pass, so the fan-out is bounded (mirroring
/// [`super::spans::MAX_SPANS`]). Exceeding it is a warning — layout
/// applies the first `MAX_RUBY_ENTRIES` and rendering proceeds.
pub const MAX_RUBY_ENTRIES: usize = 256;
