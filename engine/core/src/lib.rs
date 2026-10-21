//! Shojiku data model.
//!
//! This crate owns the three input artifacts of the engine and their
//! validation:
//!
//! - `definitions` — the data dictionary used by the Designer/AI/validation
//! - `templates` — page/section/item layout with data bindings
//! - `params` — runtime data supplied by the calling application
//!
//! Rendering itself lives in `shojiku-layout` / `shojiku-render-pdf`;
//! this crate is deliberately renderer-agnostic.

mod catalog;
mod definitions;
mod edges;
mod error;
pub mod facts;
mod geometry;
mod interpolate;
mod length;
mod params;
mod parse;
mod ruby;
#[cfg(feature = "schema")]
mod schema;
mod style;
mod template;
mod validate;
pub mod yaml;

pub use catalog::{ArrayElement, Catalog, FieldSpec};
pub use definitions::{
    Definitions, EnumEntry, FieldType, FormatVariant, LabeledEnumValue, MAX_ENUM_VALUES,
    MAX_SCHEMA_DEPTH, MAX_SCHEMA_NODES, Schema, SchemaType, parse_definitions,
};
pub use edges::{EdgeSpec, EdgeValue};
pub use error::CoreError;
pub use geometry::{
    AlignItems, AnchorEdge, AnchorOffset, AnchorPoint, BoxSpec, BoxType, FlexBasis, FlexDirection,
    GridTrack, JustifyContent, MAX_GRID_TRACKS, MAX_PAGE_PT, OptBox, Orientation, PageMargin,
    PageSize, PageSpec, PointSpec, TrackSpec,
};
pub use interpolate::{Segment, parse_segments};
pub use length::{DEFAULT_FONT_SIZE_PT, FontRel, Length, PhysicalUnit};
pub use params::{is_blank, parse_params, resolve_path};
pub use ruby::{
    LinePlacement, MAX_NOTE_LEN, MAX_RUBY_LEN, RubySegment, RubyWarning, parse_aozora_ruby,
};
pub use style::{
    BorderColor, BorderStyle, BorderStyleKind, BorderWidth, DEFAULT_LINE_HEIGHT, DEFAULT_STROKE_PT,
    FontStyle, FontWeight, HangingPunctuation, LineBreak, LineStyle, MAX_STYLE_NAMES, MAX_STYLES,
    Overflow, Style, StyleKey, TextAlign, TextCombine, TextCombineUpright, TextDecoration,
    TextOrientation, TextOverflow, TextSpacingTrim, VerticalAlign, WritingMode,
};
pub use template::{
    Band, Binding, BindingScope, Bindings, Body, BreakBefore, CharGridItem, CharGridSpec,
    CheckboxItem, ChildHolder, ChildList, Column, ColumnType, ContainerItem, DocumentMeta, EcLevel,
    EllipseItem, EmptyBehavior, EqualsValue, FlowBody, FormatDefaults, FormatRef, GridDirection,
    GridSpec, HeaderGroup, ImageFit, ImageItem, InlineFormat, Item, ItemKind, KinsokuMode,
    LineItem, Link, ListItem, MAX_BINDINGS, MAX_CHAR_GRID_CELLS, MAX_CONTAINER_DEPTH,
    MAX_DOCUMENT_ENTRIES, MAX_FORMATS, MAX_IMPOSITION_PER_PAGE, MAX_ROW_CONDITIONAL_STYLES,
    MAX_RUBY_ENTRIES, MAX_SPANS, MarkBinding, Markup, NamedFormat, NamedFormatKind, PageBreakItem,
    PageNumberItem, QrCodeItem, RectItem, Repeat, RepeatFlowItem, RepeatItem, RowConditionalStyle,
    RowSpec, RubyPair, Sections, Span, TableHeaderSpec, TableItem, Template, TemplateDefaults,
    TextItem, TextMark, parse_template,
};
pub use validate::validate;
pub use yaml::MAX_INPUT_BYTES;
