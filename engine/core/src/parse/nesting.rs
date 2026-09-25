//! The template nesting bound, checked on the pass-1 `Value` before the
//! typed parse reads the document.
//!
//! serde_yaml's own limit bounds the `Value` tree, but not the typed parse:
//! `serde` buffers every internally-tagged `Item` and re-reads it, so each
//! item nested inside another costs far more stack than a `Value` level, and
//! a valid document inside the parser's limit could exhaust a thread's stack
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
//! The walk itself recurses once per `Value` level and so shares the parser's
//! bound, like every other walk over the pass-1 tree.

use crate::error::CoreError;
use crate::template::MAX_CONTAINER_DEPTH;
use serde_yaml::Value;
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
    walk(raw, "", "", 0)
}

/// `level` is how many `items:` sequences enclose `node`; `holder` is the path
/// of the nearest sequence element enclosing it.
fn walk(node: &Value, path: &str, holder: &str, level: usize) -> Result<(), CoreError> {
    match untag(node) {
        Value::Mapping(map) => {
            for (key, value) in map {
                let Some(key) = key.as_str() else { continue };
                let here = join(path, key);
                match (key, untag(value)) {
                    ("items", Value::Sequence(items)) => {
                        // Body items are level 1, so a holder at depth `d`
                        // opens level `d + 1`: past the cap is `d > MAX`.
                        if level > MAX_CONTAINER_DEPTH {
                            return Err(refusal(holder));
                        }
                        elements(items, &here, level + 1)?;
                    }
                    _ => walk(value, &here, holder, level)?,
                }
            }
            Ok(())
        }
        Value::Sequence(seq) => elements(seq, path, level),
        _ => Ok(()),
    }
}

fn elements(seq: &[Value], path: &str, level: usize) -> Result<(), CoreError> {
    for (i, value) in seq.iter().enumerate() {
        let here = format!("{path}[{i}]");
        walk(value, &here, &here, level)?;
    }
    Ok(())
}

/// A tag (`!name`) changes nothing about what a node nests.
fn untag(mut node: &Value) -> &Value {
    while let Value::Tagged(tagged) = node {
        node = &tagged.value;
    }
    node
}

fn join(path: &str, key: &str) -> String {
    if path.is_empty() {
        key.to_owned()
    } else {
        format!("{path}.{key}")
    }
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
