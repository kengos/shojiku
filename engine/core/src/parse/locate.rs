//! Re-locates a template parse failure that the tagged-enum buffering cut short.
//!
//! `serde` buffers an internally-tagged enum (`Item`, `Body`) and re-reads
//! it, so a failure INSIDE an item surfaces with its path truncated to the
//! enum boundary (`sections.body`) and the offending key only in prose. That
//! is enough for a human and useless to a tool that wants to point at, or
//! repair, the item. This pass runs only after the typed parse has already
//! failed: it walks the pass-1 tree to every `items:` sequence (the one
//! spelling all four item holders share — a band, both body kinds, and
//! `ContainerItem`, which also backs a repeat `cell`, a repeat_flow `item`
//! and a table column `cell`), finds the first element that does not parse
//! as an [`Item`] (read through [`crate::yaml::from_value`]), and follows
//! that chain down to the deepest item that fails on its own.
//!
//! The refinement is applied only when that item's own error is part of the
//! original message, so a document whose FIRST failure lies elsewhere keeps
//! the error serde reported. The work is one deserialize per sibling along a
//! single failing chain, plus one per candidate key — O(size × depth), on the
//! error path only. It is NOT bounded by how far the typed parse got: a
//! document that fails at a top-level key is still walked to the items below
//! it. What bounds its recursion is the nesting check that ran before the
//! typed parse ([`super::nesting`]), which counts every `items:` sequence
//! this walk can reach. Its cost at the full input cap is not pinned by a test;
//! the path it reports is spelled only for the culprit ([`super::trail`]).

use super::trail::Trail;
use crate::template::Item;
use crate::yaml::{Value, from_value};

/// Where an in-item failure really is: the item's path, and the item's own
/// top-level key the failure rejects as unknown, when it is one.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct ItemFault {
    pub(crate) path: String,
    pub(crate) key: Option<String>,
}

/// The failing item: its path, the error it raises alone, and the mapping.
struct Culprit<'a> {
    path: String,
    message: String,
    node: &'a Value,
}

/// Finds the item behind a template parse failure whose full serde message is
/// `message`, in the pass-1 tree `raw`. `None` when no item fails
/// on its own or when the one that does is not what `message` reports — the
/// original error then stands as serde gave it.
pub(crate) fn item_fault(raw: &Value, message: &str) -> Option<ItemFault> {
    let found = walk(raw, &mut Trail::default())?;
    message.contains(&found.message).then(|| ItemFault {
        key: unknown_key(found.node, &found.message),
        path: found.path,
    })
}

/// The first failing item under `node` in document order, deepest first.
fn walk<'a>(node: &'a Value, trail: &mut Trail<'a>) -> Option<Culprit<'a>> {
    match node {
        Value::Mapping(map) => map.iter().find_map(|(key, value)| {
            trail.push_key(key);
            let found = match (key.as_str(), value) {
                ("items", Value::Sequence(items)) => failing_item(items, trail),
                _ => walk(value, trail),
            };
            trail.pop();
            found
        }),
        Value::Sequence(seq) => seq.iter().enumerate().find_map(|(i, value)| {
            trail.push_index(i);
            let found = walk(value, trail);
            trail.pop();
            found
        }),
        _ => None,
    }
}

/// The first element of an `items:` sequence that fails to parse, narrowed to
/// the deepest failing item inside it.
fn failing_item<'a>(items: &'a [Value], trail: &mut Trail<'a>) -> Option<Culprit<'a>> {
    items.iter().enumerate().find_map(|(i, node)| {
        let err = from_value::<Item>(node).err()?;
        trail.push_index(i);
        let found = walk(node, trail).unwrap_or_else(|| Culprit {
            path: trail.spell(),
            message: err.full,
            node,
        });
        trail.pop();
        Some(found)
    })
}

/// The item's own top-level key the error rejects as unknown. The message
/// alone cannot say at what DEPTH the unknown field sits — a `style` rejected
/// inside `box` reads exactly like one rejected on the item — nor where a key
/// that contains serde's own quoting ends. So each of the mapping's real keys
/// the message quotes is only a candidate, and it is the answer only if the
/// item without it no longer makes that complaint: removing a key an inner
/// struct rejected leaves the complaint standing, and no key is named.
fn unknown_key(node: &Value, message: &str) -> Option<String> {
    let Value::Mapping(map) = node else {
        return None;
    };
    map.iter()
        .map(|(key, _)| key.as_str())
        .filter(|key| message.contains(&complaint(key)))
        .find(|key| {
            let without = map.iter().filter(|(name, _)| name != key).cloned();
            from_value::<Item>(&Value::Mapping(without.collect()))
                .err()
                .is_none_or(|err| !err.full.contains(&complaint(key)))
        })
        .map(str::to_owned)
}

/// serde's wording for an unknown field, through its closing "`,".
fn complaint(key: &str) -> String {
    format!("unknown field `{key}`,")
}

#[cfg(test)]
mod tests;
