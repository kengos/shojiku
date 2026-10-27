//! The parser crate, configured once: every read of the door (the tree and
//! the typed read) goes through [`read`], so both see the same YAML.
//!
//! What the settings decide, beside the door's own refusals:
//!
//! - an alias replays at most [`MAX_ALIAS_EVENTS`] events in the whole
//!   document, however large the document is;
//! - only `true` and `false` are booleans (`yes`, `on` stay strings);
//! - `<<` is an ordinary key, not a merge;
//! - a tag the parser does not know (a local `!name`) is refused;
//! - a NaN or an infinity reaches the visitor, which refuses it with its path;
//! - a duplicate key reaches the visitor too, which refuses it with its path;
//! - the parser's own budgets sit at or above what a document inside
//!   [`MAX_INPUT_BYTES`] can hold, so they never refuse a document the door's
//!   checks would read.

use super::{MAX_ALIAS_EVENTS, MAX_DEPTH, MAX_INPUT_BYTES};
use serde_saphyr::{DuplicateKeyPolicy, MergeKeyPolicy, NonFiniteFloatPolicy, Options};

/// A few levels more than the door allows, so the door's refusal, with its
/// path, is the one that fires.
const PARSER_DEPTH: usize = MAX_DEPTH + 8;

/// The parser's configuration.
fn options() -> Options {
    serde_saphyr::options! {
        budget: serde_saphyr::budget! {
            max_depth: PARSER_DEPTH,
            max_events: MAX_INPUT_BYTES,
            max_nodes: MAX_INPUT_BYTES,
            max_aliases: MAX_INPUT_BYTES,
            max_anchors: MAX_INPUT_BYTES,
            max_recorded_anchor_events: MAX_INPUT_BYTES,
            // One anchor referenced many times is how one style is shared;
            // the total below is the bound.
            enforce_alias_anchor_ratio: false,
        },
        alias_limits: serde_saphyr::alias_limits! {
            max_total_replayed_events: MAX_ALIAS_EVENTS,
            max_replay_stack_depth: PARSER_DEPTH,
        },
        strict_booleans: true,
        merge_keys: MergeKeyPolicy::AsOrdinary,
        reject_unsupported_tags: true,
        non_finite_float_policy: NonFiniteFloatPolicy::PassThrough,
        duplicate_keys: DuplicateKeyPolicy::LastWins,
        with_snippet: false,
    }
}

/// Runs `f` against a deserializer over `input`.
#[expect(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "the door itself: the one place the parser reads a document"
)]
pub(super) fn read<'de, R>(
    input: &'de str,
    f: impl for<'e> FnOnce(serde_saphyr::Deserializer<'de, 'e>) -> Result<R, serde_saphyr::Error>,
) -> Result<R, serde_saphyr::Error> {
    serde_saphyr::with_deserializer_from_str_with_options(input, options(), f)
}
