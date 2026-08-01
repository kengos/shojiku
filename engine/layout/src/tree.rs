//! The layout tree: fully positioned, fully formatted primitives.
//!
//! Coordinates are pt, origin top-left, y-down (the renderer flips to
//! PDF's bottom-left origin). Serializable so `shojiku inspect` can emit
//! it for AI/GUI consumption. Text-block types live in [`text`],
//! re-exported here so `crate::tree::X` paths stay stable.

use serde::Serialize;
use shojiku_image::PathCmd;

mod round;
mod text;
pub use round::{rounded_rect_cmds, Corners, Dash};
pub use text::{DecorationSpec, RunView, TextBlock, TextLine, TextRun};

/// A laid-out document: every page's primitives, ready to draw.
#[derive(Debug, Clone, Serialize)]
pub struct LayoutDocument {
    pub page_width: f64,
    pub page_height: f64,
    pub pages: Vec<LayoutPage>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct LayoutPage {
    pub items: Vec<LayoutItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LayoutItem {
    Text(TextBlock),
    Rect(RectShape),
    Line(LineShape),
    Image(ImageShape),
    /// A stroked/filled vector path (form marks: `ellipse` and the
    /// `checkbox` check). Carries the backend-neutral [`PathCmd`]
    /// currency; both renderers already play paths back.
    Path(PathShape),
    /// A clipped group (`overflow: hidden` / `textOverflow: clip`) —
    /// the one nested node in the otherwise flat item list. Consumers of
    /// the inspect envelope must recurse into `items`.
    Clip(ClipShape),
}

/// A rectangular clip group: `items` draw only inside the rect (the
/// clipping box's border box). Nests for nested `overflow: hidden`
/// boxes. Renderers must clip — this is the single planned exception to
/// "renderers only draw flat primitives". A degenerate or non-finite
/// rect means *nothing* draws (fail closed: an unclippable group must
/// not leak content the author asked to hide). Layout bounds nesting by
/// `MAX_CONTAINER_DEPTH`; renderers additionally cap recursion at
/// [`MAX_CLIP_DEPTH`] against hand-built trees.
#[derive(Debug, Clone, Default, Serialize)]
pub struct ClipShape {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    /// Corner radii of the clipping box — a `borderRadius` on a box that
    /// also sets `overflow: hidden` clips children to the ROUNDED border
    /// box, so content cannot spill past a rounded edge. Square by
    /// default.
    #[serde(default, skip_serializing_if = "Corners::is_square")]
    pub radius: Corners,
    pub items: Vec<LayoutItem>,
}

/// Maximum clip-group nesting either renderer will descend; deeper
/// subtrees are skipped (drawn as nothing, fail closed). Lives on the
/// tree contract so PDF and PNG cannot drift. Layout output stays well
/// under this (container depth caps at 32); the guard exists for
/// hand-built [`LayoutDocument`]s.
pub const MAX_CLIP_DEPTH: usize = 64;

#[derive(Debug, Clone, Serialize)]
pub struct RectShape {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub stroke: Option<(f32, f32, f32)>,
    pub stroke_width: f64,
    pub fill: Option<(f32, f32, f32)>,
    /// Paint alpha `0..=1` (F2 `opacity`) applied to fill and stroke
    /// alike. Already sanity-clamped by layout; `1.0` = opaque.
    pub opacity: f32,
    /// Corner radii (`borderRadius`), already resolved and clamped to the
    /// box. Square by default; both fill and stroke follow them.
    #[serde(default, skip_serializing_if = "Corners::is_square")]
    pub radius: Corners,
    /// Stroke dash pattern (`borderStyle: dashed | dotted`), already
    /// resolved to pt. `None` strokes solid.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dash: Option<Dash>,
}

impl Default for RectShape {
    /// A degenerate but *visible-when-sized* rect: opaque, square,
    /// solid. Construction sites spread `..Default::default()` so a later
    /// decoration knob does not have to be threaded through every
    /// literal — `opacity` must therefore default to 1.0, not 0.0.
    fn default() -> Self {
        RectShape {
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 0.0,
            stroke: None,
            stroke_width: 0.0,
            fill: None,
            opacity: 1.0,
            radius: Corners::default(),
            dash: None,
        }
    }
}

/// A placed image. `asset_id` references the shared `AssetStore` (the
/// bytes/vectors live there, like fonts in `FontStore`); the rectangle is
/// the final draw box — fit/centering was already resolved by layout.
#[derive(Debug, Clone, Serialize)]
pub struct ImageShape {
    pub asset_id: String,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    /// Whole-image paint alpha `0..=1` (the `opacity` style key). Already
    /// sanity-clamped by layout; `1.0` is the fully-opaque default. Both
    /// backends apply it as a group over the whole raster/vector image, so
    /// a partly-transparent image reads as one unit.
    pub opacity: f32,
    /// Hyperlink URL (LK1), already interpolated and scheme/length-gated
    /// by layout. The PDF backend emits one link annotation over the draw
    /// box; PNG has no annotation surface and ignores it (a link has no
    /// visual form, so backend symmetry is preserved).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LineShape {
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub width: f64,
    pub color: (f32, f32, f32),
    /// Paint alpha `0..=1` (F2 `opacity`). Already sanity-clamped; `1.0`
    /// = opaque.
    pub opacity: f32,
    /// Stroke dash pattern in pt (`line` items' `style: dashed | dotted`
    /// and the dashed sides of a per-side border). `None` strokes solid.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dash: Option<Dash>,
}

impl Default for LineShape {
    /// Opaque, solid, zero-length — see [`RectShape::default`] for why
    /// `opacity` is 1.0 rather than the derived 0.0.
    fn default() -> Self {
        LineShape {
            x1: 0.0,
            y1: 0.0,
            x2: 0.0,
            y2: 0.0,
            width: 0.0,
            color: (0.0, 0.0, 0.0),
            opacity: 1.0,
            dash: None,
        }
    }
}

/// A stroked/filled vector path in pt (page coordinates: top-left origin,
/// y-down). Stroke caps and joins are always **round** — marks are
/// hand-drawn-style strokes where butt caps / miter joins read as broken.
/// Renderers play `cmds` back verbatim; layout owns all geometry.
#[derive(Debug, Clone, Serialize)]
pub struct PathShape {
    pub cmds: Vec<PathCmd>,
    pub stroke: Option<(f32, f32, f32)>,
    pub stroke_width: f64,
    pub fill: Option<(f32, f32, f32)>,
    /// Paint alpha `0..=1`; already sanity-clamped; `1.0` = opaque.
    pub opacity: f32,
}

impl PathShape {
    /// Shifts every command by `(dx, dy)` pt — the translate pass's hook
    /// (flow cursor, margins, flex placement) into path geometry.
    pub fn offset(&mut self, dx: f64, dy: f64) {
        for cmd in &mut self.cmds {
            *cmd = match *cmd {
                PathCmd::MoveTo(x, y) => PathCmd::MoveTo(x + dx, y + dy),
                PathCmd::LineTo(x, y) => PathCmd::LineTo(x + dx, y + dy),
                PathCmd::CurveTo(x1, y1, x2, y2, x, y) => {
                    PathCmd::CurveTo(x1 + dx, y1 + dy, x2 + dx, y2 + dy, x + dx, y + dy)
                }
                PathCmd::Close => PathCmd::Close,
            };
        }
    }
}

#[cfg(test)]
mod tests;
