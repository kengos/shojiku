//! Which strings an item interpolates and which declaration map serves
//! them — the item-shape half of the declaration checks, kept pure so
//! adding a carrier is one arm in one place.

use crate::template::{Bindings, Item};

/// The declarations an item carries; `None` for the item kinds that
/// interpolate nothing and so have no `bindings:` key at all.
pub(super) fn declarations(item: &Item) -> Option<&Bindings> {
    match item {
        Item::Text(text) => Some(&text.bindings),
        Item::Image(image) => Some(&image.bindings),
        Item::QrCode(qr) => Some(&qr.bindings),
        Item::CharGrid(grid) => Some(&grid.bindings),
        Item::List(list) => Some(&list.bindings),
        _ => None,
    }
}

/// Every string of `item` the `{name}` grammar runs over — the surfaces
/// one declaration map serves. A text item's spans are included: they
/// resolve against the OWNING item's map, never one of their own.
///
/// `overflow_text` is deliberately absent: its `{count}` is a plain
/// substitution layout performs, not an interpolation.
pub(super) fn interpolated_strings(item: &Item) -> Vec<&str> {
    let mut out: Vec<&str> = Vec::new();
    match item {
        Item::Text(text) => {
            out.extend(text.text.as_deref());
            out.extend(text.link.as_ref().map(|l| l.url.as_str()));
            for span in &text.spans {
                out.extend(span.text.as_deref());
                out.extend(span.link.as_ref().map(|l| l.url.as_str()));
            }
        }
        Item::Image(image) => out.extend(image.link.as_ref().map(|l| l.url.as_str())),
        Item::QrCode(qr) => out.extend(qr.text.as_deref()),
        Item::CharGrid(grid) => out.extend(grid.text.as_deref()),
        Item::List(list) => out.extend(list.text.as_deref()),
        _ => {}
    }
    out
}

/// Whether the item's `{name}` interpolations resolve against ARRAY
/// ELEMENTS of its own (a `list`'s per-entry template), rather than the
/// ambient scope. Definitions do not model entry shapes, so an
/// element-scoped declaration on such an item is unverifiable here and
/// checked at layout — exactly like the entry template's bare `{key}`
/// segments already are.
pub(super) fn is_entry_scoped(item: &Item) -> bool {
    matches!(item, Item::List(_))
}
