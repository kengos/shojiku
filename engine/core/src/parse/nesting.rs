//! The template nesting bound, checked on the pass-1 tree before the typed
//! parse reads the document.
//!
//! The YAML door's depth bound limits the tree, but not the typed parse:
//! `serde` buffers every internally-tagged `Item` and re-reads it, so each
//! item nested inside another costs far more stack than a `Value` level, and
//! a valid document inside the door's bound could exhaust a thread's stack
//! — which aborts the process rather than failing the parse. This walk runs
//! first and refuses such a document with the same `container_depth_exceeded`
//! that validation reports, so the typed parse, and the [`super::locate`] pass
//! that re-reads items after it fails, only ever see a bounded chain.
//!
//! What it counts is `items:` SEQUENCES, whatever the `type` beside them. Every
//! item held by another item sits in one — `items` is the spelling a band, both
//! body kinds and `ContainerItem` share, and `ContainerItem` also backs a
//! `repeat` cell, a `repeat_flow` item and a table column `cell` — so on a valid
//! document the count is exactly validation's container depth, and the path is
//! the one validation reports: the nearest sequence element holding the
//! too-deep list (the item, or the table column). Counting by `type` instead
//! would leave `locate` unbounded, since it re-reads every `items:` sequence it
//! finds, including one under an item whose type takes none.
//!
//! Every key is a string: the door refuses any other, which the buffered
//! struct could read as `items` (it takes a plain integer as a field NUMBER).
//!
//! The walk itself recurses once per tree level and so shares the door's
//! bound, like every other walk over the pass-1 tree; the holder's path is
//! spelled only when it refuses ([`super::trail`]).

use super::trail::Trail;
use crate::error::CoreError;
use crate::template::MAX_CONTAINER_DEPTH;
use crate::yaml::Value;
use shojiku_diagnostics::Echo;

/// The only keys on a valid route from the root to an `items:` sequence. A
/// path made of these and indices quotes nothing from the document, so it is
/// kept whole — it must equal validation's path, which is not clipped. Any
/// other key means the document is invalid anyway, and its path is echoed.
const STRUCTURAL: [&str; 8] = [
    "sections", "header", "body", "footer", "items", "columns", "cell", "item",
];

/// Refuses a template whose `items:` sequences nest deeper than validation's
/// [`MAX_CONTAINER_DEPTH`] allows.
pub(crate) fn template(raw: &Value) -> Result<(), CoreError> {
    walk(raw, &mut Trail::default(), 0, 0)
}

/// `level` is how many `items:` sequences enclose `node`; `holder` is how deep
/// in `trail` the nearest sequence element enclosing it sits.
fn walk<'a>(
    node: &'a Value,
    trail: &mut Trail<'a>,
    holder: usize,
    level: usize,
) -> Result<(), CoreError> {
    match node {
        Value::Mapping(map) => {
            for (key, value) in map {
                trail.push_key(key);
                match (key.as_str(), value) {
                    ("items", Value::Sequence(items)) => {
                        // Body items are level 1, so a holder at depth `d`
                        // opens level `d + 1`: past the cap is `d > MAX`.
                        if level > MAX_CONTAINER_DEPTH {
                            return Err(refusal(&trail.spell_to(holder)));
                        }
                        elements(items, trail, level + 1)?;
                    }
                    _ => walk(value, trail, holder, level)?,
                }
                trail.pop();
            }
            Ok(())
        }
        Value::Sequence(seq) => elements(seq, trail, level),
        _ => Ok(()),
    }
}

fn elements<'a>(seq: &'a [Value], trail: &mut Trail<'a>, level: usize) -> Result<(), CoreError> {
    for (i, value) in seq.iter().enumerate() {
        trail.push_index(i);
        let holder = trail.depth();
        walk(value, trail, holder, level)?;
        trail.pop();
    }
    Ok(())
}

fn refusal(holder: &str) -> CoreError {
    CoreError::ContainerDepth {
        path: if holder.split('.').all(is_structural) {
            Echo::clipped_to(holder, holder.len())
        } else {
            Echo::from(holder)
        },
        max: MAX_CONTAINER_DEPTH,
    }
}

/// A structural key, bare or with ONE numeric index (`items[3]`). The index is
/// checked, not assumed: a document key may itself be spelled `items[…`, and
/// a check that stopped at the bracket would pass it through unclipped.
fn is_structural(segment: &str) -> bool {
    let (name, index) = match segment.split_once('[') {
        Some((name, rest)) => (name, rest.strip_suffix(']')),
        None => (segment, Some("0")),
    };
    STRUCTURAL.contains(&name)
        && index.is_some_and(|i| !i.is_empty() && i.bytes().all(|b| b.is_ascii_digit()))
}

#[cfg(test)]
mod tests;
