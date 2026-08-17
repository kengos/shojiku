//! Container and imposition (n-up) items: nested boxes, the `repeat`
//! grid spec, and their hostile-input caps.

use crate::geometry::OptBox;
use crate::length::Length;
use crate::style::Style;
use serde::{Deserialize, Serialize};

use super::visibility::VisibleBinding;
use super::{Binding, Item};

/// Maximum container nesting depth. Untrusted templates drive the layout
/// resolve pass; the cap (mirroring the SVG group-depth cap) keeps a
/// hostile chain from driving recursion or `%` amplification. Enforced
/// both at validate time and independently at layout time.
pub const MAX_CONTAINER_DEPTH: usize = 32;

/// A container: establishes an origin and a resolved size; children are
/// positioned relative to it and may use `%` of its size. `box.h` omitted
/// means auto height (the lowest child bottom edge). Containers nest;
/// `table` and `page_number` are not allowed inside (Phase 1).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct ContainerItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// Params-conditional presence; unset draws unconditionally.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible: Option<VisibleBinding>,
    #[serde(rename = "box", default, skip_serializing_if = "Option::is_none")]
    pub box_: Option<OptBox>,
    /// Inherited style for all descendants (CSS cascade). Only the
    /// inherited properties (`color`, `fontSize`, `fontFamily`,
    /// `lineHeight`, `textAlign`, `lineBreak`) propagate; children override
    /// with their own `style`. Positioning is never inherited — a container
    /// passes style down, never geometry.
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub items: Vec<Item>,
}

/// Maximum cells (`columns × rows`) imposed on one page. Untrusted
/// templates drive the grid dimensions; this hard cap keeps a hostile
/// `columns: 1_000_000` from producing degenerate slots or overflowing the
/// per-page count. It is a **safety net, not a UX limit** — the GUI enforces
/// a smaller practical maximum. 64 (8×8) is generous even for an A2 sheet of
/// office print work. Over-cap grids are clamped with a diagnostic at layout,
/// never a panic or a hard rejection.
pub const MAX_IMPOSITION_PER_PAGE: usize = 64;

/// Data-driven imposition (n-up): repeats a `cell` sub-template once per
/// element of a `data` array, tiling the flow region in a `columns × rows`
/// grid and paginating when a page's grid fills. Each cell is **data-scoped
/// to its element** (the table row-scoping mechanism, generalized), so the
/// cell template is authored once — no per-instance field renaming. Only
/// valid in a flow body (like `table`); `absolute`/band/container placements
/// warn and skip. `table` / `page_number` inside a cell are out of the first
/// cut (they warn and skip, like inside a container).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct RepeatItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// Params-conditional presence; unset draws unconditionally.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible: Option<VisibleBinding>,
    /// The array params key; one cell is emitted per element, in order.
    pub data: Binding,
    /// Whether the grid forces a fresh page before it starts (default) or
    /// begins at the flow cursor. Unset never serializes.
    #[serde(
        rename = "breakBefore",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    break_before: Option<BreakBefore>,
    /// Whether trim guides are drawn for the grid: short ticks
    /// just outside the grid's bounding box at every cut position, so the
    /// imposed sheet can be cut without measuring. Unset never serializes
    /// and means `false`.
    #[serde(rename = "cutMarks", default, skip_serializing_if = "Option::is_none")]
    cut_marks: Option<bool>,
    #[serde(default, skip_serializing_if = "GridSpec::is_default")]
    pub grid: GridSpec,
    /// The per-element sub-template, modeled as a [`ContainerItem`]: its box
    /// resolves against the grid slot, children position relative to it, and
    /// its `data:` / `{{key}}` bindings resolve against the bound element.
    pub cell: ContainerItem,
}

impl RepeatItem {
    /// Effective break behavior before the grid (default [`BreakBefore::Page`]
    /// — the grid aligns to a fresh page, which is what every template
    /// authored before this key existed expects).
    pub fn break_before(&self) -> BreakBefore {
        self.break_before.unwrap_or_default()
    }

    /// Whether trim guides are drawn (default `false` — the unchanged
    /// behavior of every template authored before the key existed).
    pub fn cut_marks(&self) -> bool {
        self.cut_marks.unwrap_or(false)
    }
}

/// Whether an imposition grid forces a page break before it starts (CSS
/// `break-before` semantics, narrowed to the two values that mean something
/// for a grid that owns the whole region).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum BreakBefore {
    /// Start at the flow cursor: the first page's grid keeps the cell size
    /// but only as many ROWS as the region left under the cursor fits, so a
    /// title above the grid costs rows, not a whole page. When nothing fits
    /// under the cursor the grid falls back to a fresh page.
    Auto,
    /// Always break to a fresh page first (the default): every page's grid
    /// aligns to the region top.
    #[default]
    Page,
}

/// Grid geometry for imposition: how many cells across/down each page, the
/// fill order, and the gaps between them. Omitted entirely, it defaults to a
/// single cell per page (`1 × 1`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GridSpec {
    /// Cells across per page (≥ 1). `columns × rows` is the cells-per-page
    /// count; e.g. `2 × 2` = 4-up, `4 × 1` = a single row of four.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    columns: Option<usize>,
    /// Cells down per page (≥ 1).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    rows: Option<usize>,
    /// Fill order across the grid: `row` fills left-to-right then wraps to
    /// the next row (default); `column` fills top-to-bottom then wraps to
    /// the next column.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    direction: Option<GridDirection>,
    /// Gap on BOTH axes — the CSS `gap` shorthand, exactly as a
    /// `box.type: grid` container takes it. An axis-specific key below
    /// wins over it. Omitted means no gap.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    gap: Option<Length>,
    /// Horizontal gap between columns; resolves against the region width
    /// (a [`Length`], so pt or `%`). Omitted falls back to `gap`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    column_gap: Option<Length>,
    /// Vertical gap between rows; resolves against the region height.
    /// Omitted falls back to `gap`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    row_gap: Option<Length>,
}

impl GridSpec {
    /// Effective cells across per page (default 1).
    pub fn columns(&self) -> usize {
        self.columns.unwrap_or(1)
    }

    /// Effective horizontal gap: the axis key, else the `gap` shorthand.
    /// The fallback lives here rather than at the use site so no caller
    /// can read the raw field and silently miss the shorthand.
    pub fn column_gap(&self) -> Option<Length> {
        self.column_gap.or(self.gap)
    }

    /// Effective vertical gap: the axis key, else the `gap` shorthand.
    pub fn row_gap(&self) -> Option<Length> {
        self.row_gap.or(self.gap)
    }

    /// Effective cells down per page (default 1).
    pub fn rows(&self) -> usize {
        self.rows.unwrap_or(1)
    }

    /// Effective fill order (default row-major).
    pub fn direction(&self) -> GridDirection {
        self.direction.unwrap_or_default()
    }

    /// Whether every field is authored-unset (skip serialization).
    pub fn is_default(&self) -> bool {
        *self == GridSpec::default()
    }
}

/// Order in which cells fill the grid (CSS `grid-auto-flow` analog).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum GridDirection {
    /// Left-to-right, then wrap to the next row.
    #[default]
    Row,
    /// Top-to-bottom, then wrap to the next column.
    Column,
}
