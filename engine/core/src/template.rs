//! `templates` — page/section/item layout with data bindings.
//!
//! The structural core: the document tree (sections, bands, items) and how
//! data binds into it. Geometry lives in [`crate::geometry`] (non-inherited
//! positioning) and appearance in [`crate::style`] (the inherited property
//! bag) — this module composes both into the item model.
//!
//! Coordinates are PDF points (1pt = 1/72 inch), origin at the top-left of
//! the page, y growing downward (Thinreports-style). The renderer converts
//! to PDF's bottom-left origin.

use crate::error::CoreError;
use crate::geometry::{BoxSpec, PageSpec};
use crate::length::Length;
use crate::style::Style;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

mod binding;
mod char_grid;
mod document;
mod formats;
mod imposition;
mod items;
mod link;
mod marks;
mod repeat_flow;
mod ruby;
mod spans;
mod table;
#[cfg(test)]
mod tests;

pub use formats::{
    FormatDefaults, FormatRef, InlineFormat, NamedFormat, NamedFormatKind, TemplateDefaults,
    MAX_FORMATS,
};

pub use binding::{Binding, BindingScope, Bindings, MAX_BINDINGS};
pub use char_grid::{CharGridItem, CharGridSpec, KinsokuMode, Markup, MAX_CHAR_GRID_CELLS};
pub use document::{DocumentMeta, MAX_DOCUMENT_ENTRIES};
pub use imposition::{
    BreakBefore, ContainerItem, GridDirection, GridSpec, RepeatItem, MAX_CONTAINER_DEPTH,
    MAX_IMPOSITION_PER_PAGE,
};
pub use items::{
    EcLevel, ImageFit, ImageItem, LineItem, ListItem, PageBreakItem, PageNumberItem, QrCodeItem,
    RectItem, TextItem,
};
pub use link::Link;
pub use marks::{CheckboxItem, EllipseItem, EqualsValue, MarkBinding, TextMark};
pub use repeat_flow::RepeatFlowItem;
pub use ruby::{RubyPair, MAX_RUBY_ENTRIES};
pub use spans::{Span, MAX_SPANS};
pub use table::{
    Column, ColumnType, EmptyBehavior, HeaderGroup, RowConditionalStyle, RowSpec, TableHeaderSpec,
    TableItem, MAX_ROW_CONDITIONAL_STYLES,
};

/// Top-level template document. Unknown keys are parse errors and unset
/// fields never serialize — the file round-trips as authored.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Template {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<Version>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// What the document IS (PDF `/Info` + XMP): title, description,
    /// keywords, language, authors — each bindable from params. PDF-only;
    /// the PNG backend has no metadata channel.
    #[serde(default, skip_serializing_if = "DocumentMeta::is_empty")]
    pub document: DocumentMeta,
    #[serde(default, skip_serializing_if = "PageSpec::is_default")]
    pub page: PageSpec,
    /// Named styles (CSS classes): a registry of reusable [`Style`]s that
    /// items reference by name via `styleNames`. Resolved at layout time and
    /// kept named here (not flattened) so the GUI/AI round-trip and style
    /// picker have the names. A `BTreeMap` keeps serialization order
    /// deterministic. Size-bounded by [`crate::style::MAX_STYLES`].
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub styles: BTreeMap<String, Style>,
    /// Document presentation defaults: the cascade root style +
    /// per-type format defaults.
    #[serde(default, skip_serializing_if = "TemplateDefaults::is_empty")]
    pub defaults: TemplateDefaults,
    /// Named format registry (parallel to `styles`): reusable pattern
    /// definitions placements reference via `format:`. Bounded by
    /// [`MAX_FORMATS`].
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub formats: BTreeMap<String, NamedFormat>,
    pub sections: Sections,
}

/// Template version, informational only (no engine consumer yet).
/// Accepts what authors naturally write — `version: 1`, `1.5`, or
/// `"2.0"` — and serializes back in the authored form (the bare
/// number was the universal miss in the external acceptance run).
/// Numbers are finite by construction (`yaml_guard`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Version {
    Number(f64),
    Text(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Sections {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub header: Option<Band>,
    pub body: Body,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub footer: Option<Band>,
}

/// A repeating band (header/footer) with absolutely positioned items.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Band {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    repeat: Option<Repeat>,
    /// Band height in pt (informational; items use absolute page coords).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub items: Vec<Item>,
}

impl Band {
    /// Effective repeat mode (default: every page).
    pub fn repeat(&self) -> Repeat {
        self.repeat.unwrap_or_default()
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Repeat {
    #[default]
    EveryPage,
    FirstPage,
    ExceptFirstPage,
    LastPage,
}

impl Repeat {
    /// Whether a band with this repeat mode appears on `page` (1-based) of `pages`.
    pub fn applies_to(&self, page: usize, pages: usize) -> bool {
        match self {
            Repeat::EveryPage => true,
            Repeat::FirstPage => page == 1,
            Repeat::ExceptFirstPage => page > 1,
            Repeat::LastPage => page == pages,
        }
    }
}

/// The body section: either a flow (items stack, tables paginate) or a
/// plain absolute layout.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Body {
    Flow(FlowBody),
    Absolute(AbsoluteBody),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FlowBody {
    /// The region the flow occupies on every page, relative to the page
    /// margin box. Omitted = the whole margin box, so simple templates
    /// need no `box` at all.
    #[serde(rename = "box", default, skip_serializing_if = "Option::is_none")]
    pub box_: Option<BoxSpec>,
    /// Vertical gap between stacked items (a [`Length`]: bare pt, `%` of
    /// the flow-region height, or em/rem — matching `repeat_flow.gap`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    gap: Option<Length>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub items: Vec<Item>,
}

impl FlowBody {
    /// The authored gap between stacked items, if any; layout resolves it
    /// and clamps negatives to 0 (`None` = no gap).
    pub fn gap(&self) -> Option<Length> {
        self.gap
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AbsoluteBody {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub items: Vec<Item>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Item {
    Text(TextItem),
    Rect(RectItem),
    Line(LineItem),
    /// Boxed: the table wire (style layers on the table, row, and
    /// header) makes `TableItem` by far the largest variant.
    Table(Box<TableItem>),
    PageNumber(PageNumberItem),
    Image(ImageItem),
    Container(ContainerItem),
    Repeat(RepeatItem),
    RepeatFlow(RepeatFlowItem),
    QrCode(QrCodeItem),
    List(ListItem),
    PageBreak(PageBreakItem),
    CharGrid(CharGridItem),
    Ellipse(EllipseItem),
    Checkbox(CheckboxItem),
}

impl Item {
    pub fn id(&self) -> Option<&str> {
        match self {
            Item::Text(i) => i.id.as_deref(),
            Item::Rect(i) => i.id.as_deref(),
            Item::Line(i) => i.id.as_deref(),
            Item::Table(i) => i.id.as_deref(),
            Item::PageNumber(i) => i.id.as_deref(),
            Item::Image(i) => i.id.as_deref(),
            Item::Container(i) => i.id.as_deref(),
            Item::Repeat(i) => i.id.as_deref(),
            Item::RepeatFlow(i) => i.id.as_deref(),
            Item::QrCode(i) => i.id.as_deref(),
            Item::List(i) => i.id.as_deref(),
            Item::PageBreak(i) => i.id.as_deref(),
            Item::CharGrid(i) => i.id.as_deref(),
            Item::Ellipse(i) => i.id.as_deref(),
            Item::Checkbox(i) => i.id.as_deref(),
        }
    }
}

/// Parses a template from YAML (or JSON). Rejects non-finite numbers
/// (`.nan` / `.inf`) anywhere in the document — they would poison every
/// geometry computation downstream — and locates any structural error to
/// its field path (see [`crate::parse`]).
pub fn parse_template(input: &str) -> Result<Template, CoreError> {
    crate::parse::parse_checked(input, "template")
}
