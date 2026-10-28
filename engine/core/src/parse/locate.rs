//! Re-locates a template parse failure that the tagged-enum buffering cut short.
//!
//! `serde` buffers an internally-tagged enum (`Body`, `Item`) and re-reads
//! it, so a failure INSIDE one surfaces with its path cut at the enum
//! boundary (`sections.body`, or `sections.header.items[1]` for an item of a
//! band) and the offending key only in prose. That is enough for a human and
//! useless to a tool that wants to point at, or repair, the item. This pass
//! runs only after the typed parse has already failed, and follows serde's
//! own first failure down the pass-1 tree, one buffered node at a time: the
//! node at the reported path, read as the variant struct its tag names
//! ([`variant`]), fails first where serde did, now with the path below the
//! node. When that path enters an `items:` element (the one spelling all four
//! item holders share — a band, both body kinds, and `ContainerItem`, which
//! also backs a repeat `cell`, a repeat_flow `item` and a table column
//! `cell`), the failure is inside that item, and the same read is made on it.
//!
//! Nothing is compared between candidates, so a failure in a section's or a
//! container's own fields stays theirs however exactly an item inside
//! repeats it: serde failed there first. The tree is read as serde re-reads
//! a buffered enum (a `null` list is refused, not read as empty: see
//! [`crate::yaml::trace`]), and every read is checked against the fault
//! serde reported; where the two still disagree (an enum's wrong shape is
//! worded differently), the walk stops at the deepest node it confirmed: a
//! body keeps serde's own error, an item is named with no key. The work is
//! one read of the node at the reported path, then one read (and one copy)
//! per buffered node on the failing chain, each of its subtree — O(size ×
//! depth), on the error path only; the chain is as deep as the typed parse
//! read, which the nesting check bounded before it ran ([`super::nesting`]).

mod variant;

use crate::yaml::fault::Fault;
use crate::yaml::{Value, YamlError};
use serde_path_to_error::Segment;
use variant::Holder;

/// Where an in-item failure really is: the item's path, and the item's own
/// top-level key the failure rejects as unknown, when it is one.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct ItemFault {
    pub(crate) path: String,
    pub(crate) key: Option<String>,
}

/// Finds the item behind the template parse failure `err`, in the pass-1
/// tree `raw`. `None` when the failure is not inside an item — the original
/// error then stands as serde gave it.
pub(crate) fn item_fault(raw: &Value, err: &YamlError) -> Option<ItemFault> {
    let fault = err.fault.as_deref()?;
    let mut path = err.path.as_ref()?.as_str().to_owned();
    let (mut node, mut holder) = boundary(raw, &path)?;
    (holder.whole(node)? == *fault).then_some(())?;
    let mut found = matches!(holder, Holder::Item).then(|| ItemFault {
        path: path.clone(),
        key: None,
    });
    while let Some(traced) = holder.first_failure(node).filter(|t| t.fault == *fault) {
        let segments: Vec<&Segment> = traced.path.iter().collect();
        let Some(end) = item_end(&segments) else {
            return found.map(|item| ItemFault {
                key: own_key(&segments, fault),
                ..item
            });
        };
        // The segments were read off `node`, so they resolve.
        node = descend(node, &segments[..end], &mut path)?;
        holder = Holder::Item;
        found = Some(ItemFault {
            path: path.clone(),
            key: None,
        });
    }
    found
}

/// The buffered node a reported path names, and what it is read as: the
/// body, or an item of a band. Any other path was not cut by buffering.
fn boundary<'a>(raw: &'a Value, at: &str) -> Option<(&'a Value, Holder)> {
    let key = |key: &str| Segment::Map {
        key: key.to_owned(),
    };
    let rest = at.strip_prefix("sections.")?;
    let (segments, holder) = match rest.split_once(".items[") {
        None => (rest == "body").then(|| (vec![key("sections"), key(rest)], Holder::Body))?,
        Some((band, index)) => {
            let index = index.strip_suffix(']')?.parse().ok()?;
            let items = [key("sections"), key(band), key("items")];
            (
                [items.as_slice(), &[Segment::Seq { index }]].concat(),
                Holder::Item,
            )
        }
    };
    let segments: Vec<&Segment> = segments.iter().collect();
    Some((descend(raw, &segments, &mut String::new())?, holder))
}

/// How many leading segments reach the last `items:` element on the path —
/// the item the failure is inside, whatever its own segments below.
fn item_end(segments: &[&Segment]) -> Option<usize> {
    let is_item = |pair: &[&Segment]| matches!(pair, [Segment::Map { key }, Segment::Seq { .. }] if key == "items");
    Some(segments.windows(2).rposition(is_item)? + 2)
}

/// Follows `segments` down from `node`, spelling each step onto `path` the
/// way serde's path is spelled. `None` when the tree does not hold them.
fn descend<'a>(mut node: &'a Value, segments: &[&Segment], path: &mut String) -> Option<&'a Value> {
    for segment in segments {
        node = match (node, segment) {
            (Value::Sequence(items), Segment::Seq { index }) => {
                path.push_str(&format!("[{index}]"));
                items.get(*index)?
            }
            (_, Segment::Map { key }) => {
                path.push('.');
                path.push_str(key);
                node.get(key)?
            }
            _ => return None,
        };
    }
    Some(node)
}

/// The item's own top-level key the fault rejects as unknown: the failure
/// sits one key below the item and is that key being unknown. A key one of
/// its structs rejects is deeper, and is not named.
fn own_key(segments: &[&Segment], fault: &Fault) -> Option<String> {
    match (segments, fault) {
        ([Segment::Map { key }], Fault::UnknownField { field, .. }) if key == field => {
            Some(key.clone())
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests;
