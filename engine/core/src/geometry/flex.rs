//! Flex layout keys on item boxes (box-model Phase 2): the layout-mode
//! key and the content-alignment enums.
//!
//! The layout mode lives on the box (`box.type`); an unset `type`
//! behaves flex-like, so the key exists to be explicit today and to
//! gain other modes later (`grid` is box-model Phase 3). Keys are
//! camelCase (CSS-aligned), values snake_case like every other wire
//! enum (`space_between`, matching `every_page` / `row`). Only children
//! that author neither `box.x` nor `box.y` participate in flex
//! placement; a child with either is absolutely positioned within its
//! container (the Phase-1 behavior, kept as the escape hatch).

use serde::{Deserialize, Serialize};

/// The box layout mode (`box.type`). Unset behaves like [`BoxType::Flex`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BoxType {
    /// Children stack along [`FlexDirection`], with `gap`,
    /// `justifyContent`, `alignItems`, and auto margins.
    Flex,
    /// Children tile a static track grid (`columns`/`rows` — see
    /// [`crate::geometry::grid::TrackSpec`]); `direction` picks the fill
    /// order, `alignItems` aligns within rows, `justifyContent`
    /// distributes leftover track space. Grid is explicit-only: without
    /// `type: grid` the grid keys warn and are ignored.
    Grid,
}

/// The flex main axis (`box.direction`, CSS `flex-direction`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FlexDirection {
    /// Children stack top-to-bottom (the flow-body special case).
    #[default]
    Column,
    /// Children sit side by side, left-to-right. Children without an
    /// authored `w` split the leftover width equally (`flex: 1` analog).
    Row,
}

/// Cross-axis alignment of flex children (`box.alignItems`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AlignItems {
    /// Children without a cross size fill it (the CSS initial value; in
    /// `column` this is the existing fill-width behavior).
    #[default]
    Stretch,
    Start,
    Center,
    End,
    /// Row children align on their first text baseline (CSS
    /// `align-items: baseline`) — the natural fit for a label beside a
    /// checkbox/mark. A child with no text (a mark, a rect, an image, a
    /// clipped box) synthesizes its baseline from its bottom edge, so a
    /// checkbox bottom sits on the label's baseline. In a `column`
    /// container it behaves like `start` (the CSS fallback); cross-axis
    /// auto margins still win over alignment.
    Baseline,
}

/// Main-axis distribution of flex children (`box.justifyContent`).
/// Distributes only when the container's main size is definite; auto
/// margins on the main axis absorb the free space first (CSS order).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JustifyContent {
    #[default]
    Start,
    Center,
    End,
    /// First and last child flush to the edges, equal space between.
    SpaceBetween,
    /// Equal space around every child (half-size outer gaps).
    SpaceAround,
    /// Equal space between and around every child.
    SpaceEvenly,
}

#[cfg(test)]
mod tests;
