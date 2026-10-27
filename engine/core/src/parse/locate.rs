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
//! The refinement is applied only when that item's own failure is the one
//! the typed parse reported — the same [`Fault`], compared by what serde
//! failed on rather than by its wording, at a path the item lies under (the
//! buffering cut the reported path short, never off course) — so a
//! document whose FIRST failure lies in another section, or outside any,
//! keeps the error serde reported. A failure in a section's own fields that
//! an item inside it repeats exactly (the same unknown key in a `box`, the
//! same bad `gap`) is still blamed on the item: the fault cannot tell the
//! two apart, and no key is offered for it. The work is one deserialize per sibling along a
//! single failing chain, plus at most one to confirm the key — O(size ×
//! depth), on the error path only. It is NOT bounded by how far the typed parse got: a
//! document that fails at a top-level key is still walked to the items below
//! it. What bounds its recursion is the nesting check that ran before the
//! typed parse ([`super::nesting`]), which counts every `items:` sequence
//! this walk can reach. Its cost at the full input cap is not pinned by a test;
//! the path it reports is spelled only for the culprit ([`super::trail`]).

use super::trail::Trail;
use crate::template::Item;
use crate::yaml::fault::Fault;
use crate::yaml::{Value, YamlError, from_value};

/// Where an in-item failure really is: the item's path, and the item's own
/// top-level key the failure rejects as unknown, when it is one.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct ItemFault {
    pub(crate) path: String,
    pub(crate) key: Option<String>,
}

/// The failing item: its path, what it fails on alone, and the mapping.
struct Culprit<'a> {
    path: String,
    fault: Option<Box<Fault>>,
    node: &'a Value,
}

/// Finds the item behind the template parse failure `err`, in the pass-1
/// tree `raw`. `None` when no item fails on its own or when the one that
/// does is not what `err` reports — the original error then stands as serde
/// gave it.
pub(crate) fn item_fault(raw: &Value, err: &YamlError) -> Option<ItemFault> {
    let found = walk(raw, &mut Trail::default())?;
    let at = err.path.as_ref().map_or(".", |path| path.as_str());
    (found.fault == err.fault && lies_under(&found.path, at)).then(|| ItemFault {
        key: unknown_key(found.node, found.fault.as_deref()),
        path: found.path,
    })
}

/// Whether `path` is `at` or below it (`.` is the root, above everything).
fn lies_under(path: &str, at: &str) -> bool {
    at == "."
        || path
            .strip_prefix(at)
            .is_some_and(|rest| rest.is_empty() || rest.starts_with(['.', '[']))
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
            fault: err.fault,
            node,
        });
        trail.pop();
        Some(found)
    })
}

/// The item's own top-level key the error rejects as unknown. The fault
/// names the field but not at what DEPTH it sits — a `style` rejected inside
/// `box` is the same fault as one rejected on the item. So a real key of the
/// mapping with that name is only a candidate, and it is the answer only if
/// the item without it no longer fails that way: removing a key an inner
/// struct rejected leaves the fault standing, and no key is named — unless
/// that struct sits under the key of the same name, which goes with it, and
/// then that key is named.
fn unknown_key(node: &Value, fault: Option<&Fault>) -> Option<String> {
    let (Value::Mapping(map), Some(Fault::UnknownField { field, .. })) = (node, fault) else {
        return None;
    };
    map.iter().find(|(key, _)| key == field)?;
    let without = map.iter().filter(|(key, _)| key != field).cloned();
    from_value::<Item>(&Value::Mapping(without.collect()))
        .err()
        .is_none_or(|err| err.fault.as_deref() != fault)
        .then(|| field.clone())
}

#[cfg(test)]
mod tests;
