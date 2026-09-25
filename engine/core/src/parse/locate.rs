//! Re-locates a template parse failure that the tagged-enum buffering cut short.
//!
//! `serde` buffers an internally-tagged enum (`Item`, `Body`) and re-reads
//! it, so a failure INSIDE an item surfaces with its path truncated to the
//! enum boundary (`sections.body`) and the offending key only in prose. That
//! is enough for a human and useless to a tool that wants to point at, or
//! repair, the item. This pass runs only after the typed parse has already
//! failed: it walks the raw YAML to every `items:` sequence (the one
//! spelling all four item holders share — a band, both body kinds, and
//! `ContainerItem`, which also backs a repeat `cell`, a repeat_flow `item`
//! and a table column `cell`), finds the first element that does not parse
//! as an [`Item`], and follows that chain down to the deepest item that
//! fails on its own.
//!
//! The refinement is applied only when that item's own error is part of the
//! original message, so a document whose FIRST failure lies elsewhere keeps
//! the error serde reported. The work is one deserialize per sibling along a
//! single failing chain, plus one per candidate key — O(size × depth), on the
//! error path only. It is NOT bounded by how far the typed parse got: a
//! document that fails at a top-level key is still walked to the items below
//! it, so this pass meets the same tagged-enum recursion the typed parse does.
//! Its cost at the full input cap is not pinned by a test.

use crate::template::Item;
use serde::Deserialize;
use serde_yaml::Value;

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
/// `message`, in the already-parsed `raw` document. `None` when no item fails
/// on its own or when the one that does is not what `message` reports — the
/// original error then stands as serde gave it.
pub(crate) fn item_fault(raw: &Value, message: &str) -> Option<ItemFault> {
    let found = walk(raw, "")?;
    message.contains(&found.message).then(|| ItemFault {
        key: unknown_key(found.node, &found.message),
        path: found.path,
    })
}

/// The first failing item under `node` in document order, deepest first.
fn walk<'a>(node: &'a Value, path: &str) -> Option<Culprit<'a>> {
    match node {
        Value::Mapping(map) => map.iter().find_map(|(key, value)| {
            let key = key.as_str()?;
            let here = join(path, key);
            match (key, value) {
                ("items", Value::Sequence(items)) => failing_item(items, &here),
                _ => walk(value, &here),
            }
        }),
        Value::Sequence(seq) => seq
            .iter()
            .enumerate()
            .find_map(|(i, value)| walk(value, &format!("{path}[{i}]"))),
        _ => None,
    }
}

/// The first element of an `items:` sequence that fails to parse, narrowed to
/// the deepest failing item inside it.
fn failing_item<'a>(items: &'a [Value], path: &str) -> Option<Culprit<'a>> {
    items.iter().enumerate().find_map(|(i, node)| {
        let err = Item::deserialize(node).err()?;
        let here = format!("{path}[{i}]");
        Some(walk(node, &here).unwrap_or(Culprit {
            path: here,
            message: err.to_string(),
            node,
        }))
    })
}

fn join(path: &str, key: &str) -> String {
    if path.is_empty() {
        key.to_owned()
    } else {
        format!("{path}.{key}")
    }
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
    map.keys()
        .filter_map(Value::as_str)
        .filter(|key| message.contains(&complaint(key)))
        .find(|key| {
            let mut without = map.clone();
            without.remove(*key);
            Item::deserialize(&Value::Mapping(without))
                .err()
                .is_none_or(|err| !err.to_string().contains(&complaint(key)))
        })
        .map(str::to_owned)
}

/// serde's wording for an unknown field, through its closing "`,".
fn complaint(key: &str) -> String {
    format!("unknown field `{key}`,")
}

#[cfg(test)]
mod tests;
