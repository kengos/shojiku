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
mod geometry;
mod interpolate;
mod length;
mod params;
mod parse;
mod ruby;
mod style;
mod template;
mod validate;
mod yaml_guard;

pub use catalog::{ArrayElement, Catalog, FieldSpec};
pub use definitions::{
    parse_definitions, Definitions, EnumEntry, FieldType, FormatVariant, LabeledEnumValue, Schema,
    SchemaType, MAX_ENUM_VALUES, MAX_SCHEMA_DEPTH, MAX_SCHEMA_NODES,
};
pub use edges::{EdgeSpec, EdgeValue};
pub use error::CoreError;
pub use geometry::{
    AlignItems, BoxSpec, BoxType, FlexDirection, GridTrack, JustifyContent, OptBox, Orientation,
    PageMargin, PageSize, PageSpec, PointSpec, TrackSpec, MAX_GRID_TRACKS, MAX_PAGE_PT,
};
pub use interpolate::{parse_segments, Segment};
pub use length::{FontRel, Length, PhysicalUnit, DEFAULT_FONT_SIZE_PT};
pub use params::{is_blank, parse_params, resolve_path};
pub use ruby::{
    parse_aozora_ruby, LinePlacement, RubySegment, RubyWarning, MAX_NOTE_LEN, MAX_RUBY_LEN,
};
pub use style::{
    BorderColor, BorderStyle, BorderStyleKind, BorderWidth, FontStyle, FontWeight,
    HangingPunctuation, LineBreak, LineStyle, Overflow, Style, TextAlign, TextCombine,
    TextCombineUpright, TextDecoration, TextOrientation, TextOverflow, TextSpacingTrim,
    VerticalAlign, WritingMode, DEFAULT_LINE_HEIGHT, DEFAULT_STROKE_PT, MAX_STYLES,
    MAX_STYLE_NAMES,
};
pub use template::{
    parse_template, Band, Binding, BindingScope, Bindings, Body, BreakBefore, CharGridItem,
    CharGridSpec, CheckboxItem, Column, ColumnType, ContainerItem, DocumentMeta, EcLevel,
    EllipseItem, EmptyBehavior, EqualsValue, FlowBody, FormatDefaults, FormatRef, GridDirection,
    GridSpec, HeaderGroup, ImageFit, ImageItem, InlineFormat, Item, KinsokuMode, LineItem, Link,
    ListItem, MarkBinding, Markup, NamedFormat, NamedFormatKind, PageBreakItem, PageNumberItem,
    QrCodeItem, RectItem, Repeat, RepeatFlowItem, RepeatItem, RowConditionalStyle, RowSpec,
    RubyPair, Sections, Span, TableHeaderSpec, TableItem, Template, TemplateDefaults, TextItem,
    TextMark, MAX_BINDINGS, MAX_CHAR_GRID_CELLS, MAX_CONTAINER_DEPTH, MAX_DOCUMENT_ENTRIES,
    MAX_FORMATS, MAX_IMPOSITION_PER_PAGE, MAX_ROW_CONDITIONAL_STYLES, MAX_RUBY_ENTRIES, MAX_SPANS,
};
pub use validate::validate;
