//! Box geometry: the rectangles items occupy.
//!
//! The box half of [`crate::geometry`] — a fully specified [`BoxSpec`]
//! and the partial [`OptBox`] that carries positioning, the border-box
//! spacing (`margin`/`padding`), the min/max bounds, and the flex /
//! grid layout keys. Positioning never cascades (see the module header);
//! this file only models the wire form, layout resolves it.

use serde::{Deserialize, Serialize};

use super::{AlignItems, BoxType, FlexBasis, FlexDirection, JustifyContent, TrackSpec};
use crate::edges::EdgeSpec;
use crate::length::Length;

#[cfg(test)]
mod tests;

/// A fully specified rectangle. Lengths resolve against the parent
/// (`%` of the page for top-level boxes) at layout time.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BoxSpec {
    pub x: Length,
    pub y: Length,
    pub w: Length,
    pub h: Length,
}

/// A partially specified box. Meaning depends on context:
/// in a flow, `x`/`w` are relative to the flow box and `y` is ignored;
/// inside a container, all four resolve against the container's box.
/// Box sizing is border-box: `w`/`h` are the outer box, `padding` insets
/// the content, `margin` spaces the box within its parent. Unknown keys
/// are rejected — a typo like `alignItmes:` silently meaning "unset"
/// would be an invisible authoring bug. (Not `Copy`: grid track lists
/// are heap-backed — callers clone, which is cheap and rare.)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OptBox {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<Length>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<Length>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub w: Option<Length>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub h: Option<Length>,
    /// Minimum border-box width (CSS `min-width`). A [`Length`]; `%`
    /// resolves against the parent width. Clamps the resolved/filled
    /// width in CSS order (min wins over max wins over the size).
    #[serde(rename = "minWidth", default, skip_serializing_if = "Option::is_none")]
    pub min_width: Option<Length>,
    /// Maximum border-box width (CSS `max-width`).
    #[serde(rename = "maxWidth", default, skip_serializing_if = "Option::is_none")]
    pub max_width: Option<Length>,
    /// Minimum border-box height (CSS `min-height`). `%` resolves
    /// against the parent height; against an auto-height parent it drops
    /// with `percent_of_auto`, like `h`.
    #[serde(rename = "minHeight", default, skip_serializing_if = "Option::is_none")]
    pub min_height: Option<Length>,
    /// Maximum border-box height (CSS `max-height`).
    #[serde(rename = "maxHeight", default, skip_serializing_if = "Option::is_none")]
    pub max_height: Option<Length>,
    /// Outer spacing: a bare number (all sides) or a per-side map
    /// (`{ top: 10, left: "5%" }`, unset = 0). Offsets the box in its
    /// parent and spaces flow siblings additively with `gap` (no margin
    /// collapse). Negative values are allowed; margin sides also accept
    /// `auto` (free-space absorption under flex placement).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub margin: Option<EdgeSpec>,
    /// Inner spacing (same forms as `margin`, minus `auto`). Insets
    /// content without growing the box (border-box); must be
    /// non-negative. Ignored on `rect` (no content to inset).
    #[serde(
        default,
        deserialize_with = "crate::edges::deserialize_padding",
        skip_serializing_if = "Option::is_none"
    )]
    pub padding: Option<EdgeSpec>,
    /// The layout mode for this box's children (box-model Phase 2).
    /// Unset behaves like `flex`; the key exists to be explicit and to
    /// gain other modes later (`grid` is Phase 3). Only meaningful on
    /// boxes with children (`container`, `repeat` cells) — `validate`
    /// warns when flex keys appear on a leaf item's box.
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub type_: Option<BoxType>,
    /// Flex main axis: `column` (default; children stack) or `row`
    /// (children sit side by side).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub direction: Option<FlexDirection>,
    /// Main-axis gap between flex children (a [`Length`]; `%` resolves
    /// against the container's main-axis content size). Negative gaps
    /// are treated as 0 (CSS). Absolutely positioned children ignore it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gap: Option<Length>,
    /// Cross-axis alignment of flex children (default `stretch`).
    #[serde(
        rename = "alignItems",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub align_items: Option<AlignItems>,
    /// Main-axis distribution of flex children (default `start`); on a
    /// grid box it distributes leftover track space instead.
    #[serde(
        rename = "justifyContent",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub justify_content: Option<JustifyContent>,
    /// Grid column tracks (`box.type: grid` only): a count (equal
    /// split) or a track-size list. Default: one column.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub columns: Option<TrackSpec>,
    /// Grid row tracks: a count (equal split of a definite height —
    /// auto-height containers degrade to auto rows with a diagnostic)
    /// or a track-size list; rows beyond the list are auto (sized by
    /// their tallest child).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rows: Option<TrackSpec>,
    /// Horizontal gap between grid columns. Falls back to `gap`.
    #[serde(rename = "columnGap", default, skip_serializing_if = "Option::is_none")]
    pub column_gap: Option<Length>,
    /// Vertical gap between grid rows. Falls back to `gap`.
    #[serde(rename = "rowGap", default, skip_serializing_if = "Option::is_none")]
    pub row_gap: Option<Length>,
    /// Flex grow weight (CSS `flex-grow`): how much of the row's LEFTOVER
    /// main-axis width this child takes, once every child has its basis.
    /// `flexGrow / Σ` of the leftover. The default is CSS's 0 — a child
    /// sizes to its content and the leftover stays free space for
    /// `justifyContent`. Unlike the container keys above this is a
    /// *child* property, so it is valid on a leaf box; it is inert on a
    /// sized child and under `grid`. A negative / non-finite value warns
    /// (`invalid_flex_grow`) and contributes 0.
    #[serde(rename = "flexGrow", default, skip_serializing_if = "Option::is_none")]
    pub flex_grow: Option<f64>,
    /// Flex basis (CSS `flex-basis`): the main-axis size a `row` child
    /// without an authored `w` starts from, before `flexGrow` splits the
    /// leftover. Unset = [`FlexBasis::Content`] (max-content, CSS
    /// `flex-basis: auto`); author `0` for the `flex: 1` idiom, where
    /// `flexGrow` divides the whole row. A *child* property like
    /// `flexGrow`; inert on a sized child, in a `column`, and under
    /// `grid`.
    #[serde(rename = "flexBasis", default, skip_serializing_if = "Option::is_none")]
    pub flex_basis: Option<FlexBasis>,
    /// Grid child: how many column tracks this child spans. A
    /// *child* property like `flexGrow` — valid on leaves. Only acts
    /// inside a `box.type: grid` parent (elsewhere layout warns
    /// `span_outside_grid`); clamped to the available tracks at layout
    /// (`grid_span_clamped`).
    #[serde(
        rename = "columnSpan",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub column_span: Option<usize>,
    /// Grid child: how many row tracks this child spans. Same
    /// rules as `columnSpan`.
    #[serde(rename = "rowSpan", default, skip_serializing_if = "Option::is_none")]
    pub row_span: Option<usize>,
}

impl OptBox {
    /// Effective flex grow weight (CSS initial 0 when unset). Layout
    /// warns+clamps a negative / non-finite authored value, so this
    /// returns the raw author intent.
    pub fn flex_grow(&self) -> f64 {
        self.flex_grow.unwrap_or(0.0)
    }

    /// Effective flex basis (CSS-aligned default: size from content).
    pub fn flex_basis(&self) -> FlexBasis {
        self.flex_basis.unwrap_or_default()
    }

    /// Effective grid spans `(columns, rows)`, floored at 1.
    pub fn spans(&self) -> (usize, usize) {
        (
            self.column_span.unwrap_or(1).max(1),
            self.row_span.unwrap_or(1).max(1),
        )
    }

    /// True when either grid-span key is authored (for the
    /// outside-a-grid warning).
    pub fn has_span_keys(&self) -> bool {
        self.column_span.is_some() || self.row_span.is_some()
    }

    /// True when any box-layout key is authored (layout mode, flex axis
    /// / gap / alignment, grid tracks). `validate` warns when these
    /// appear on a leaf item's box, where there are no children to lay
    /// out.
    pub fn has_layout_keys(&self) -> bool {
        self.type_.is_some()
            || self.direction.is_some()
            || self.gap.is_some()
            || self.align_items.is_some()
            || self.justify_content.is_some()
            || self.has_grid_keys()
    }

    /// True when any grid-only key is authored. These act only under
    /// `box.type: grid`; `validate` warns (`grid_key_ignored`) when they
    /// appear without it.
    pub fn has_grid_keys(&self) -> bool {
        self.columns.is_some()
            || self.rows.is_some()
            || self.column_gap.is_some()
            || self.row_gap.is_some()
    }
}

/// A `line` endpoint. Both axes are full [`Length`] values, so an
/// endpoint can name a fraction of the box it sits in (`"100%"`) instead
/// of a hand-measured pt — which is what lets a line underline a flex
/// child whose real width is unknowable at authoring time. Bare numbers
/// stay `pt`, so every pre-existing template parses and re-serializes
/// unchanged. `x` resolves against the placement context's width, `y`
/// against its height (a `%` under an auto-height parent drops with
/// `percent_of_auto`, like every other vertical `%`).
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PointSpec {
    pub x: Length,
    pub y: Length,
}
