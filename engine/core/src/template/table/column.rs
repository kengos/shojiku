//! Table columns: what one column binds and renders per row — a bound
//! value (text / QR / image) or a freely composed `cell:` sub-template.

use crate::length::Length;
use crate::style::Style;
use serde::{Deserialize, Serialize};

use super::super::imposition::ContainerItem;
use super::super::items::ImageFit;
use super::super::Binding;

/// One table column. Width omitted means "an equal share of the region
/// width left over after the sized columns" (the row-flex `flex: 1`
/// analog).
///
/// A column renders EITHER a bound value (`data:`, optionally as
/// `type: qr_code` / `image`) OR a `cell:` sub-template of freely placed
/// items. The two are mutually exclusive and one is required — validate
/// reports both mistakes with the column's own path (`column_content_
/// conflict` / `column_content_missing`), which a parse-level rejection
/// could not do: serde buffers the internally-tagged `Item` enum, so an
/// error inside a column surfaces at the `sections.body` boundary.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Column {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// What each cell renders from `data:`: `text` (default) formats the
    /// bound value; `qr_code` encodes it at layout time; `image` loads it
    /// as a per-element asset (data URI or bundled path). Inert — and a
    /// validate conflict — on a `cell:` column.
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub column_type: Option<ColumnType>,
    /// Image-column fit (default `contain`); inert on other types
    /// (validate warns).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fit: Option<ImageFit>,
    /// The row-relative binding. Absent only on a `cell:` column.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Binding>,
    /// A per-row sub-template: freely placed items with the CELL's
    /// top-left as their coordinate origin, scoped to the row element so
    /// `data:` / `{{key}}` inside read the row's fields. The `repeat`
    /// cell's container, in a table column.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cell: Option<ContainerItem>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<Length>,
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
}

impl Column {
    /// Effective column content type (default `text`).
    pub fn column_type(&self) -> ColumnType {
        self.column_type.unwrap_or_default()
    }

    /// Effective image fit (default `contain`).
    pub fn fit(&self) -> ImageFit {
        self.fit.unwrap_or_default()
    }

    /// The bound key, if the column binds one (a `cell:` column doesn't).
    pub fn data_key(&self) -> Option<&str> {
        self.data.as_ref().map(|b| b.key.as_str())
    }
}

/// What a table column renders per row from its `data:` binding.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ColumnType {
    #[default]
    Text,
    QrCode,
    Image,
}
