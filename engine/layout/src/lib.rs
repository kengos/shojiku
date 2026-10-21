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
pub use engine::{LayoutInput, LayoutOutput, layout};
pub use font::{
    FontError, FontFace, FontStore, PositionedGlyph, RunOptions, VGlyph, arrange_vertical,
    embedding_restricted, face_sha256, shape_run,
};
pub use shojiku_core::TextOrientation;
pub use tree::{
    ClipShape, Corners, DEFAULT_DOCUMENT_TITLE, Dash, DecorationSpec, DocumentMetadata, ImageShape,
    LayoutDocument, LayoutItem, LayoutPage, LineShape, MAX_CLIP_DEPTH, PathShape, RectShape,
    RunView, TextBlock, TextLine, TextRun, rounded_rect_cmds,
};
pub use wrap::wrap_text;
