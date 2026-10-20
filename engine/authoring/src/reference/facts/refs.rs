//! Which catalog values name something defined elsewhere: another item's
//! `id`, a named style, a named format, or a key of the params data.

use serde_json::Value;

/// What a reference names.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RefKind {
    /// An item's `id`.
    Item,
    /// An entry of the template's `styles:` registry.
    Style,
    /// A format name: an entry of `formats:` or of the locale pack.
    Format,
    /// A key path into the params data.
    DataKey,
}

impl RefKind {
    /// The `x-shojiku-ref` value.
    pub fn as_str(self) -> &'static str {
        match self {
            RefKind::Item => "item",
            RefKind::Style => "style",
            RefKind::Format => "format",
            RefKind::DataKey => "dataKey",
        }
    }
}

/// The references named one by one. Every `styleNames` and
/// `alternateStyleNames` list is a style reference too, found by name in
/// [`references`].
pub const NAMED: [(&str, RefKind); 8] = [
    // An ellipse names the item it circles; a line endpoint, the item its
    // edge lands on. Both are the bare id string.
    ("Item.ellipse.anchor", RefKind::Item),
    ("PointSpec.item", RefKind::Item),
    ("Binding.key", RefKind::DataKey),
    ("MarkBinding.key", RefKind::DataKey),
    ("VisibleBinding.key", RefKind::DataKey),
    ("Binding.format", RefKind::Format),
    // A definitions field's display form: the names a binding's `format:`
    // takes.
    ("Schema.displayFormat", RefKind::Format),
    // A format choice: the name form is the reference; the map form is an
    // inline pattern.
    ("FormatRef", RefKind::Format),
];

/// Nodes whose NAME looks like a reference and which are not one, with why.
/// The completeness test reads it, so a new node with a reference-shaped
/// name is classified rather than missed.
pub const NOT_REFERENCES: [(&str, &str); 3] = [
    (
        "Item.page_number.format",
        "a text template with {page}/{pages} tokens",
    ),
    (
        "Item.repeat_flow.item",
        "the container repeated per row, not an id",
    ),
    (
        "Schema.format",
        "the data's meaning (`date`, `currency`), not a name",
    ),
];

/// Property names a reference is spelled under.
pub const REFERENCE_SHAPED: [&str; 7] = [
    "anchor",
    "item",
    "key",
    "format",
    "displayFormat",
    "styleNames",
    "alternateStyleNames",
];

/// Every reference in `catalog`: the named ones plus each style-name list.
pub fn references(catalog: &Value) -> Vec<(String, RefKind)> {
    let lists = super::super::annotations::nodes(catalog)
        .into_iter()
        .filter(|node| node.ends_with(".styleNames") || node.ends_with(".alternateStyleNames"))
        .map(|node| (node, RefKind::Style));
    NAMED
        .iter()
        .map(|(node, kind)| ((*node).to_string(), *kind))
        .chain(lists)
        .collect()
}
