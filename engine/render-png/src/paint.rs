//! The tiny-skia painter: per-page drawing of text glyph outlines,
//! rects, lines, clip groups, and (via `paint/image.rs`) images at a
//! uniform px/pt scale.

mod gradient;
mod image;
mod text;

use crate::RenderPngError;
use shojiku_image::{AssetStore, PathCmd};
use shojiku_layout::{
    rounded_rect_cmds, ClipShape, Corners, Dash, FontFace, FontStore, LayoutItem, LineShape,
    PathShape, RectShape, MAX_CLIP_DEPTH,
};
use std::collections::HashMap;
use tiny_skia::{
    Color, FillRule, LineCap, LineJoin, Mask, Paint, PathBuilder, Pixmap, Stroke, StrokeDash,
    Transform,
};

// Unit tests exercise the corrupt-buffer path directly; production code
// reaches it only through `draw_raster`.
#[cfg(test)]
pub(crate) use image::pixmap_from_rgba;

pub(crate) struct Painter<'a> {
    pub(crate) fonts: &'a FontStore,
    pub(crate) assets: &'a AssetStore,
    /// pt -> px scale, applied to every drawing call.
    pub(crate) transform: Transform,
    /// Glyph outlines in pt, keyed by (font id, glyph id, size bits).
    pub(crate) glyph_cache: HashMap<(String, u32, u64), Option<Vec<PathCmd>>>,
}

impl Painter<'_> {
    /// Draws one tree item. `mask` is the active clip (px space, already
    /// intersected across enclosing clip groups); `clip_depth` guards
    /// hand-built trees against unbounded clip nesting.
    pub(crate) fn draw_item(
        &mut self,
        pixmap: &mut Pixmap,
        item: &LayoutItem,
        mask: Option<&Mask>,
        clip_depth: usize,
    ) -> Result<(), RenderPngError> {
        match item {
            LayoutItem::Text(block) => self.draw_text(pixmap, block, mask),
            LayoutItem::Rect(shape) => {
                self.draw_rect(pixmap, shape, mask);
                Ok(())
            }
            LayoutItem::Line(shape) => {
                self.draw_line(pixmap, shape, mask);
                Ok(())
            }
            LayoutItem::Image(shape) => self.draw_image(pixmap, shape, mask),
            LayoutItem::Path(shape) => {
                self.draw_path(pixmap, shape, mask);
                Ok(())
            }
            LayoutItem::Clip(clip) => self.draw_clip(pixmap, clip, mask, clip_depth),
        }
    }

    /// Enters a clip group: intersects the clip rect (in px, via the
    /// same pt->px transform as drawing) into the active mask and draws
    /// the children under it. Fail closed per the tree contract: a
    /// too-deep, degenerate, or non-finite clip draws NOTHING — drawing
    /// unclipped would leak content the author hid. Cost bound: one
    /// canvas-sized mask per nesting level, ≤ [`MAX_CLIP_DEPTH`] levels
    /// on an already cap-checked canvas.
    fn draw_clip(
        &mut self,
        pixmap: &mut Pixmap,
        clip: &ClipShape,
        mask: Option<&Mask>,
        clip_depth: usize,
    ) -> Result<(), RenderPngError> {
        if clip_depth >= MAX_CLIP_DEPTH
            || !(clip.w.is_finite() && clip.w > 0.0 && clip.h.is_finite() && clip.h > 0.0)
        {
            return Ok(());
        }
        let Some(path) = box_path(clip.x, clip.y, clip.w, clip.h, clip.radius) else {
            return Ok(());
        };
        // Start from the enclosing clip, or a full mask derived from the
        // canvas (always filled opaque before drawing, so its alpha is a
        // solid 255), then cut it down to this group's rect.
        let mut next = match mask {
            Some(parent) => parent.clone(),
            None => Mask::from_pixmap(pixmap.as_ref(), tiny_skia::MaskType::Alpha),
        };
        next.intersect_path(&path, FillRule::Winding, true, self.transform);
        for child in &clip.items {
            self.draw_item(pixmap, child, Some(&next), clip_depth + 1)?;
        }
        Ok(())
    }

    /// Cached glyph outline lookup (in pt, at the pen origin), keyed by the
    /// glyph id the font layer already resolved.
    pub(crate) fn glyph_outline(
        &mut self,
        face: &FontFace,
        font_id: &str,
        gid: u32,
        size: f64,
    ) -> Option<Vec<PathCmd>> {
        let key = (font_id.to_string(), gid, size.to_bits());
        self.glyph_cache
            .entry(key)
            .or_insert_with(|| face.glyph_path(gid, size))
            .clone()
    }

    pub(crate) fn draw_rect(&self, pixmap: &mut Pixmap, shape: &RectShape, mask: Option<&Mask>) {
        let Some(path) = box_path(shape.x, shape.y, shape.w, shape.h, shape.radius) else {
            return;
        };
        if let Some(fill) = shape.fill {
            let mut paint = Paint::default();
            paint.set_color(rgba(fill, shape.opacity));
            paint.anti_alias = true;
            pixmap.fill_path(&path, &paint, FillRule::Winding, self.transform, mask);
        }
        if let (Some(color), true) = (shape.stroke, shape.stroke_width > 0.0) {
            let mut paint = Paint::default();
            paint.set_color(rgba(color, shape.opacity));
            paint.anti_alias = true;
            let stroke = Stroke {
                width: shape.stroke_width as f32,
                dash: dash_of(shape.dash),
                ..Default::default()
            };
            pixmap.stroke_path(&path, &paint, &stroke, self.transform, mask);
        }
    }

    /// Draws a form-mark path (`ellipse`, `checkbox` check): optional
    /// fill, then a round-capped/joined stroke.
    pub(crate) fn draw_path(&self, pixmap: &mut Pixmap, shape: &PathShape, mask: Option<&Mask>) {
        let Some(path) = build_path(&shape.cmds, 0.0, 0.0) else {
            return;
        };
        if let Some(fill) = shape.fill {
            let mut paint = Paint::default();
            paint.set_color(rgba(fill, shape.opacity));
            paint.anti_alias = true;
            pixmap.fill_path(&path, &paint, FillRule::Winding, self.transform, mask);
        }
        if let (Some(color), true) = (shape.stroke, shape.stroke_width > 0.0) {
            let mut paint = Paint::default();
            paint.set_color(rgba(color, shape.opacity));
            paint.anti_alias = true;
            let stroke = Stroke {
                width: shape.stroke_width as f32,
                line_cap: LineCap::Round,
                line_join: LineJoin::Round,
                ..Default::default()
            };
            pixmap.stroke_path(&path, &paint, &stroke, self.transform, mask);
        }
    }

    pub(crate) fn draw_line(&self, pixmap: &mut Pixmap, shape: &LineShape, mask: Option<&Mask>) {
        let mut pb = PathBuilder::new();
        pb.move_to(shape.x1 as f32, shape.y1 as f32);
        pb.line_to(shape.x2 as f32, shape.y2 as f32);
        let Some(path) = pb.finish() else { return };
        let mut paint = Paint::default();
        paint.set_color(rgba(shape.color, shape.opacity));
        paint.anti_alias = true;
        let stroke = Stroke {
            width: shape.width as f32,
            dash: dash_of(shape.dash),
            ..Default::default()
        };
        pixmap.stroke_path(&path, &paint, &stroke, self.transform, mask);
    }
}

/// The outline of a box: the plain rectangle when the corners are
/// square, else the layout-built rounded path — so a rounded box's fill,
/// stroke and clip mask all follow the same curve.
pub(crate) fn box_path(x: f64, y: f64, w: f64, h: f64, radius: Corners) -> Option<tiny_skia::Path> {
    if radius.is_square() {
        return rect_path(x, y, w, h);
    }
    build_path(&rounded_rect_cmds(x, y, w, h, radius), 0.0, 0.0)
}

/// The tiny-skia dash for a layout dash pattern, or `None` for a solid
/// stroke. `StrokeDash::new` rejects a non-positive or non-finite
/// interval — and `stroke_path` then draws NOTHING AT ALL rather than
/// falling back — so an unusable pattern degrades to solid here instead
/// of silently blanking the stroke.
pub(crate) fn dash_of(dash: Option<Dash>) -> Option<StrokeDash> {
    let Dash { on, off } = dash?;
    StrokeDash::new(vec![on as f32, off as f32], 0.0)
}

/// Builds a tiny-skia path from flattened commands, translated by
/// `(dx, dy)` pt. `None` when the commands form nothing drawable.
pub(crate) fn build_path(cmds: &[PathCmd], dx: f64, dy: f64) -> Option<tiny_skia::Path> {
    let mut pb = PathBuilder::new();
    let tx = |x: f64| (x + dx) as f32;
    let ty = |y: f64| (y + dy) as f32;
    for cmd in cmds {
        match *cmd {
            PathCmd::MoveTo(x, y) => pb.move_to(tx(x), ty(y)),
            PathCmd::LineTo(x, y) => pb.line_to(tx(x), ty(y)),
            PathCmd::CurveTo(x1, y1, x2, y2, x, y) => {
                pb.cubic_to(tx(x1), ty(y1), tx(x2), ty(y2), tx(x), ty(y))
            }
            PathCmd::Close => pb.close(),
        }
    }
    pb.finish()
}

/// Builds a closed rectangle path in pt; `None` for degenerate input.
pub(crate) fn rect_path(x: f64, y: f64, w: f64, h: f64) -> Option<tiny_skia::Path> {
    let cmds = [
        PathCmd::MoveTo(x, y),
        PathCmd::LineTo(x + w, y),
        PathCmd::LineTo(x + w, y + h),
        PathCmd::LineTo(x, y + h),
        PathCmd::Close,
    ];
    build_path(&cmds, 0.0, 0.0)
}

/// Layout colors are 0..=1 floats; tiny-skia takes the same, opaque.
pub(crate) fn rgb((r, g, b): (f32, f32, f32)) -> Color {
    Color::from_rgba(r.clamp(0.0, 1.0), g.clamp(0.0, 1.0), b.clamp(0.0, 1.0), 1.0)
        .unwrap_or(Color::BLACK)
}

/// A color with its paint alpha applied. Layout clamps opacity; the
/// clamp here covers hand-built trees.
pub(crate) fn rgba((r, g, b): (f32, f32, f32), opacity: f32) -> Color {
    Color::from_rgba(
        r.clamp(0.0, 1.0),
        g.clamp(0.0, 1.0),
        b.clamp(0.0, 1.0),
        opacity.clamp(0.0, 1.0),
    )
    .unwrap_or(Color::BLACK)
}
