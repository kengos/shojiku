//! Data-driven tables: columns, row spec, header spec, and empty-data
//! behavior.
//!
//! wire discipline: every scalar the author may omit is an `Option`
//! that is skipped on serialization (no injected defaults — round-trip
//! fidelity), effective defaults live in accessor methods, and all four
//! structs deny unknown keys so a typo is a parse error, not a silent
//! no-op. Widths and heights are [`Length`]s (bare numbers stay pt).

mod column;
mod row;

pub use column::{Column, ColumnType};
pub use row::{RowConditionalStyle, RowSpec, MAX_ROW_CONDITIONAL_STYLES};

use crate::geometry::OptBox;
use crate::length::Length;
use crate::style::Style;
use serde::{Deserialize, Serialize};

use super::visibility::VisibleBinding;
use super::Binding;

/// A data-driven table. Rows come from an array params key; each column
/// binds a key relative to the row object. `style`/`styleNames` control
/// the grid border (`borderWidth`/`borderColor`, default 0.5pt black) and
/// cascade their inherited properties into every cell.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// Params-conditional presence; unset draws unconditionally.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible: Option<VisibleBinding>,
    /// Optional geometry box. In the FLOW body it narrows the table
    /// horizontally (`box.x`/`box.w`, `auto` margins center; `box.y` and
    /// height stay flow-owned) while pagination continues. In every other
    /// context (a container child, an absolute body, a band, a grid cell)
    /// the table renders as ONE bounded block against this box and does
    /// not paginate. Geometry only — the grid border stays `style`.
    #[serde(rename = "box", default, skip_serializing_if = "Option::is_none")]
    pub box_: Option<OptBox>,
    pub data: Binding,
    pub columns: Vec<Column>,
    #[serde(default, skip_serializing_if = "RowSpec::is_empty")]
    pub row: RowSpec,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_page_break: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repeat_header: Option<bool>,
    /// Break to a fresh page first when the whole table would otherwise
    /// split across pages but fits on one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keep_together: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub empty_behavior: Option<EmptyBehavior>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub header: Option<TableHeaderSpec>,
    /// Header group row (multi-level headers): cells spanning
    /// several columns, rendered above the column labels and repeated
    /// with them. Spans are clamped to the column count at layout.
    #[serde(
        rename = "headerGroups",
        default,
        skip_serializing_if = "Vec::is_empty"
    )]
    pub header_groups: Vec<HeaderGroup>,
    /// opt-in: a run of empty body cells merges into the next
    /// non-empty cell to its right (trailing empties extend the last
    /// non-empty cell), so section-heading rows read as one wide cell.
    #[serde(
        rename = "mergeEmptyCells",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub merge_empty_cells: Option<bool>,
    /// Padding inside each cell, in pt.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cell_padding: Option<f64>,
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
}

impl TableItem {
    /// Effective `autoPageBreak` (default true).
    pub fn auto_page_break(&self) -> bool {
        self.auto_page_break.unwrap_or(true)
    }

    /// Effective `repeatHeader` (default true).
    pub fn repeat_header(&self) -> bool {
        self.repeat_header.unwrap_or(true)
    }

    /// Effective `keepTogether` (default false).
    pub fn keep_together(&self) -> bool {
        self.keep_together.unwrap_or(false)
    }

    /// Effective `emptyBehavior` (default `collapse`).
    pub fn empty_behavior(&self) -> EmptyBehavior {
        self.empty_behavior.unwrap_or_default()
    }

    /// Effective `cellPadding` in pt (default 4).
    pub fn cell_padding(&self) -> f64 {
        self.cell_padding.unwrap_or(4.0)
    }

    /// Effective `mergeEmptyCells` (default false).
    pub fn merge_empty_cells(&self) -> bool {
        self.merge_empty_cells.unwrap_or(false)
    }
}

/// One cell of the header group row: a label spanning `span` columns.
/// `style`/`styleNames` layer over the table cascade (the classic
/// header fill applies unless overridden).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HeaderGroup {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub span: usize,
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum EmptyBehavior {
    /// Hide the whole table when the array is empty.
    #[default]
    Collapse,
    /// Render the header row only.
    Reserve,
}

/// Header-row overrides: height and style (its `backgroundColor` replaces
/// the default header fill).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableHeaderSpec {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<Length>,
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<Style>,
}
