//! The typed read of a buffered node's VARIANT struct: the one read that
//! says where inside a `Body` or an `Item` serde failed.
//!
//! Reading the enum itself buffers the node again, so its failure comes back
//! with the path cut at the node, as the template parse's did. After the tag,
//! serde reads the node as the struct the tag names; this module makes that
//! same read on the tree ([`crate::yaml::trace`], which reads the tree as
//! serde's re-read of the buffer does), from the node without its `type:` key, so the
//! failure it reports is serde's first failure in the node, with the path
//! below it. The item arms are one per [`ItemKind`], whose match the compiler
//! keeps complete.

use crate::template::{
    AbsoluteBody, Body, CharGridItem, CheckboxItem, ContainerItem, EllipseItem, FlowBody,
    ImageItem, Item, ItemKind, LineItem, ListItem, PageBreakItem, PageNumberItem, QrCodeItem,
    RectItem, RepeatFlowItem, RepeatItem, TableItem, TextItem,
};
use crate::yaml::fault::Fault;
use crate::yaml::{Traced, Value, trace};
use serde::de::DeserializeOwned;

/// What a buffered node is read as.
#[derive(Clone, Copy)]
pub(super) enum Holder {
    Body,
    Item,
}

impl Holder {
    /// The node read as the enum, as the template parse read it: the failure
    /// serde reported, when this node is where it was.
    pub(super) fn whole(self, node: &Value) -> Option<Fault> {
        match self {
            Holder::Body => read::<Body>(node),
            Holder::Item => read::<Item>(node),
        }
        .map(|traced| traced.fault)
    }

    /// The node's first failure below its tag. `None` when the node reads
    /// whole, or has no tag this read can follow (not a mapping, no string
    /// `type:`, an item type that does not exist).
    pub(super) fn first_failure(self, node: &Value) -> Option<Traced> {
        let (tag, fields) = split(node)?;
        match self {
            // A tag the enum lacks fails at `type`, which no boundary is,
            // so a body read here is `flow` or `absolute`.
            Holder::Body if tag == "flow" => read::<FlowBody>(&fields),
            Holder::Body => read::<AbsoluteBody>(&fields),
            Holder::Item => item(
                ItemKind::ALL
                    .into_iter()
                    .find(|kind| kind.as_str() == tag)?,
                &fields,
            ),
        }
    }
}

/// The node's `type:` and its other keys.
fn split(node: &Value) -> Option<(&str, Value)> {
    let Value::Mapping(entries) = node else {
        return None;
    };
    let Some(Value::String(tag)) = node.get("type") else {
        return None;
    };
    let fields = entries.iter().filter(|(key, _)| key != "type").cloned();
    Some((tag, Value::Mapping(fields.collect())))
}

fn item(kind: ItemKind, fields: &Value) -> Option<Traced> {
    match kind {
        ItemKind::Text => read::<TextItem>(fields),
        ItemKind::Rect => read::<RectItem>(fields),
        ItemKind::Line => read::<LineItem>(fields),
        ItemKind::Table => read::<TableItem>(fields),
        ItemKind::PageNumber => read::<PageNumberItem>(fields),
        ItemKind::Image => read::<ImageItem>(fields),
        ItemKind::Container => read::<ContainerItem>(fields),
        ItemKind::Repeat => read::<RepeatItem>(fields),
        ItemKind::RepeatFlow => read::<RepeatFlowItem>(fields),
        ItemKind::QrCode => read::<QrCodeItem>(fields),
        ItemKind::List => read::<ListItem>(fields),
        ItemKind::PageBreak => read::<PageBreakItem>(fields),
        ItemKind::CharGrid => read::<CharGridItem>(fields),
        ItemKind::Ellipse => read::<EllipseItem>(fields),
        ItemKind::Checkbox => read::<CheckboxItem>(fields),
    }
}

fn read<T: DeserializeOwned>(fields: &Value) -> Option<Traced> {
    trace::<T>(fields).err()
}
