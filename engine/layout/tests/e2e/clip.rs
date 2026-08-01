//! D2 `overflow: hidden` / `textOverflow: clip` end to end
//! (deliberately cross-cutting: the clip node is emitted by
//! containers, repeat cells, repeat_flow cards, and text blocks).

mod boxes;
mod text;

use shojiku_layout::{ClipShape, LayoutItem, LayoutPage};

/// Top-level clip groups on a page.
pub(crate) fn clip_shapes(page: &LayoutPage) -> Vec<&ClipShape> {
    page.items
        .iter()
        .filter_map(|i| match i {
            LayoutItem::Clip(c) => Some(c),
            _ => None,
        })
        .collect()
}

/// Asserts exactly one top-level clip on the page and returns it.
pub(crate) fn only_clip(page: &LayoutPage) -> &ClipShape {
    let clips = clip_shapes(page);
    assert_eq!(clips.len(), 1, "expected exactly one clip group");
    clips[0]
}
