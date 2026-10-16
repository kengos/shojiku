//! [`ItemKind`] — an item's `type:` as a value, without the item.
//!
//! The per-kind facts the engine publishes (which style keys a kind paints
//! with, in `crate::facts`) are keyed by it, and a walk that only needs to
//! know WHICH kind it holds can match on it instead of on [`Item`] and its
//! payloads.

use super::Item;

#[cfg(test)]
mod tests;

/// The fifteen item kinds, one per [`Item`] variant, named on the wire by
/// [`ItemKind::as_str`] — the item's `type:` value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum ItemKind {
    Text,
    Rect,
    Line,
    Table,
    PageNumber,
    Image,
    Container,
    Repeat,
    RepeatFlow,
    QrCode,
    List,
    PageBreak,
    CharGrid,
    Ellipse,
    Checkbox,
}

impl ItemKind {
    /// Every kind, in [`Item`]'s declaration order.
    pub const ALL: [ItemKind; 15] = [
        ItemKind::Text,
        ItemKind::Rect,
        ItemKind::Line,
        ItemKind::Table,
        ItemKind::PageNumber,
        ItemKind::Image,
        ItemKind::Container,
        ItemKind::Repeat,
        ItemKind::RepeatFlow,
        ItemKind::QrCode,
        ItemKind::List,
        ItemKind::PageBreak,
        ItemKind::CharGrid,
        ItemKind::Ellipse,
        ItemKind::Checkbox,
    ];

    /// The wire spelling: the item's `type:` value.
    pub fn as_str(self) -> &'static str {
        match self {
            ItemKind::Text => "text",
            ItemKind::Rect => "rect",
            ItemKind::Line => "line",
            ItemKind::Table => "table",
            ItemKind::PageNumber => "page_number",
            ItemKind::Image => "image",
            ItemKind::Container => "container",
            ItemKind::Repeat => "repeat",
            ItemKind::RepeatFlow => "repeat_flow",
            ItemKind::QrCode => "qr_code",
            ItemKind::List => "list",
            ItemKind::PageBreak => "page_break",
            ItemKind::CharGrid => "char_grid",
            ItemKind::Ellipse => "ellipse",
            ItemKind::Checkbox => "checkbox",
        }
    }
}

impl Item {
    /// Which kind of item this is.
    pub fn kind(&self) -> ItemKind {
        match self {
            Item::Text(_) => ItemKind::Text,
            Item::Rect(_) => ItemKind::Rect,
            Item::Line(_) => ItemKind::Line,
            Item::Table(_) => ItemKind::Table,
            Item::PageNumber(_) => ItemKind::PageNumber,
            Item::Image(_) => ItemKind::Image,
            Item::Container(_) => ItemKind::Container,
            Item::Repeat(_) => ItemKind::Repeat,
            Item::RepeatFlow(_) => ItemKind::RepeatFlow,
            Item::QrCode(_) => ItemKind::QrCode,
            Item::List(_) => ItemKind::List,
            Item::PageBreak(_) => ItemKind::PageBreak,
            Item::CharGrid(_) => ItemKind::CharGrid,
            Item::Ellipse(_) => ItemKind::Ellipse,
            Item::Checkbox(_) => ItemKind::Checkbox,
        }
    }
}
