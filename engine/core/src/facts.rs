//! The engine's per-key facts about the style wire, as data.
//!
//! Four tables, each keyed by [`StyleKey`] and written as an exhaustive
//! `match`, so a new key cannot be left out of one silently:
//!
//! - [`inherits`] — whether a key flows from an ancestor to what it holds;
//! - [`initial`] — the value a key takes when nothing authors it;
//! - [`range`] — the bounds a numeric key is held to at use, and what an
//!   out-of-range value falls back to;
//! - [`painted_by`] — which surfaces (item kinds, a rich-text span, a text
//!   mark; the document root paints nothing) paint with a key authored on
//!   their own `style:`, and
//!   [`surface_initial`] where one of them starts a key somewhere other than
//!   [`initial`].
//!
//! The key catalog renders them, and tests in `shojiku-layout` hold the
//! cascade to the inheritance and initial-value rows. The `line` item's
//! stroke style is not a [`crate::Style`]; its two bounded keys are
//! [`LINE_WIDTH`] and [`OPACITY`]. A list's overflow line, not a style key
//! either, starts as [`LIST_OVERFLOW_TEXT`].

use crate::style::StyleKey;

mod inherit;
mod initial;
mod paint;
mod ranges;
#[cfg(test)]
mod tests;

pub use inherit::inherits;
pub use initial::{
    GRID_STROKE_PT, Initial, LIST_OVERFLOW_TEXT, MARK_STROKE_PT, TABLE_CELL_VERTICAL_ALIGN,
    initial, line_initial, surface_initial,
};
pub use paint::{Surface, holds_content, painted_by, takes};
pub use ranges::{
    BORDER_WIDTH, FONT_SIZE, LETTER_SPACING, LINE_HEIGHT, LINE_WIDTH, OPACITY, ScalarRange, range,
};

/// Every surface the tables cover, for walks over them: each item kind
/// (including the four that take no `style:`), a span, a text mark and the
/// document root.
pub fn surfaces() -> impl Iterator<Item = Surface> {
    crate::ItemKind::ALL.into_iter().map(Surface::Item).chain([
        Surface::Span,
        Surface::Mark,
        Surface::Document,
    ])
}

/// Every key, for walks over the tables.
pub fn keys() -> impl Iterator<Item = StyleKey> {
    StyleKey::ALL.into_iter()
}
