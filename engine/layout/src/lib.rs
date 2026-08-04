//! Shojiku layout engine.
//!
//! Turns `template + params (+ definitions catalog) + lang pack + fonts`
//! into a [`LayoutDocument`]: pages of absolutely positioned, fully
//! formatted primitives (text lines, rects, lines). The renderer then only
//! needs to draw — no formatting or measurement happens downstream.

mod boxes;
mod color;
mod engine;
mod font;
mod style;
mod tree;
mod wrap;

pub use boxes::{BoxIndex, BoxRect, PlacedBox};
pub use color::parse_color;
pub use engine::{layout, LayoutInput, LayoutOutput};
pub use font::{
    arrange_vertical, shape_run, FontError, FontFace, FontStore, PositionedGlyph, RunOptions,
    VGlyph,
};
pub use shojiku_core::TextOrientation;
pub use tree::{
    rounded_rect_cmds, ClipShape, Corners, Dash, DecorationSpec, DocumentMetadata, ImageShape,
    LayoutDocument, LayoutItem, LayoutPage, LineShape, PathShape, RectShape, RunView, TextBlock,
    TextLine, TextRun, DEFAULT_DOCUMENT_TITLE, MAX_CLIP_DEPTH,
};
pub use wrap::wrap_text;
