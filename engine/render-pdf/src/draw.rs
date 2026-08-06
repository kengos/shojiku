//! krilla draw calls: layout items, images (raster + SVG playback),
//! glyph mapping, and geometry/paint conversions at the f32 boundary.

use crate::text::draw_text;
use crate::RenderError;
use krilla::color::rgb;
use krilla::geom::{Path, PathBuilder, Size, Transform};
use krilla::image::Image;
use krilla::num::NormalizedF32;
use krilla::paint::{Fill, FillRule, LineCap, LineJoin, Stroke, StrokeDash};
use krilla::surface::Surface;
use krilla::text::Font;
use shojiku_image::{AssetKind, AssetStore, PathCmd, RasterFormat, SvgTree};
use shojiku_layout::{
    rounded_rect_cmds, Corners, Dash, FontFace, ImageShape, LayoutItem, MAX_CLIP_DEPTH,
};
use std::collections::HashMap;

pub(crate) fn draw_item(
    surface: &mut Surface<'_>,
    item: &LayoutItem,
    embedded: &HashMap<String, (&FontFace, Font)>,
    assets: &AssetStore,
    clip_depth: usize,
) -> Result<(), RenderError> {
    match item {
        LayoutItem::Clip(clip) => {
            // Fail closed (per the tree contract): a degenerate,
            // non-finite, or too-deeply-nested clip group draws NOTHING —
            // drawing unclipped would leak content the author hid.
            if clip_depth >= MAX_CLIP_DEPTH
                || !(clip.w.is_finite() && clip.w > 0.0 && clip.h.is_finite() && clip.h > 0.0)
            {
                return Ok(());
            }
            let Some(path) = box_path(clip.x, clip.y, clip.w, clip.h, clip.radius) else {
                return Ok(());
            };
            surface.push_clip_path(&path, &FillRule::NonZero);
            // Pop the clip even when a child errors, so the surface
            // state stays balanced before the error propagates.
            let result = clip
                .items
                .iter()
                .try_for_each(|child| draw_item(surface, child, embedded, assets, clip_depth + 1));
            surface.pop();
            return result;
        }
        LayoutItem::Text(block) => draw_text(surface, block, embedded)?,
        LayoutItem::Rect(shape) => {
            surface.set_fill(shape.fill.map(|color| solid_fill(color, shape.opacity)));
            surface.set_stroke(shape.stroke.map(|color| {
                let mut stroke = solid_stroke(color, shape.stroke_width, shape.opacity);
                stroke.dash = dash_of(shape.dash);
                stroke
            }));
            // A degenerate path (NaN from hostile metrics) is skipped
            // rather than written into the PDF.
            if let Some(path) = box_path(shape.x, shape.y, shape.w, shape.h, shape.radius) {
                surface.draw_path(&path);
            }
        }
        LayoutItem::Line(shape) => {
            surface.set_fill(None);
            let mut stroke = solid_stroke(shape.color, shape.width, shape.opacity);
            stroke.dash = dash_of(shape.dash);
            surface.set_stroke(Some(stroke));
            if let Some(path) = line_path(shape.x1, shape.y1, shape.x2, shape.y2) {
                surface.draw_path(&path);
            }
        }
        LayoutItem::Image(shape) => draw_image_shape(surface, shape, assets)?,
        LayoutItem::Path(shape) => {
            surface.set_fill(shape.fill.map(|color| solid_fill(color, shape.opacity)));
            surface.set_stroke(
                shape
                    .stroke
                    .map(|color| round_stroke(color, shape.stroke_width, shape.opacity)),
            );
            if let Some(path) = svg_path(&shape.cmds) {
                surface.draw_path(&path);
            }
        }
    }
    Ok(())
}

/// Draws one placed image (raster embed or SVG vector playback).
pub(crate) fn draw_image_shape(
    surface: &mut Surface<'_>,
    shape: &ImageShape,
    assets: &AssetStore,
) -> Result<(), RenderError> {
    let asset = assets
        .get(&shape.asset_id)
        .ok_or_else(|| RenderError::UnknownAsset(shape.asset_id.clone()))?;
    // Layout only emits positive finite rects, but a hand-built tree
    // could carry a degenerate one; skip instead of corrupting the PDF.
    if !(shape.w.is_finite() && shape.w > 0.0 && shape.h.is_finite() && shape.h > 0.0) {
        return Ok(());
    }
    // `opacity` applies to the whole image as a group: push a base alpha
    // that composites the raster/vector as one unit, so overlapping SVG
    // paths don't double-blend at their seams. `1.0` needs no push.
    let translucent = shape.opacity < 1.0;
    if translucent {
        surface.push_opacity(norm_opacity(shape.opacity));
    }
    match &asset.kind {
        AssetKind::Raster { format, bytes, .. } => {
            let data: krilla::Data = bytes.clone().into();
            let image = match format {
                RasterFormat::Png => Image::from_png(data, true),
                RasterFormat::Jpeg => Image::from_jpeg(data, true),
                RasterFormat::Gif => Image::from_gif(data, true),
                RasterFormat::Webp => Image::from_webp(data, true),
            }
            .map_err(|reason| bad_image_error(&shape.asset_id, &reason))?;
            // Positive finite w/h always form a valid Size, but krilla
            // returns an Option; treat the impossible case as a skip.
            if let Some(size) = Size::from_wh(shape.w as f32, shape.h as f32) {
                surface.push_transform(&Transform::from_translate(shape.x as f32, shape.y as f32));
                surface.draw_image(image, size);
                surface.pop();
            }
        }
        AssetKind::Svg(tree) => draw_svg(surface, tree, shape),
    }
    if translucent {
        surface.pop();
    }
    Ok(())
}

/// Plays back a parsed SVG tree, scaled from viewBox units into the
/// shape's rect. The single pushed transform also scales stroke widths,
/// matching how SVG renders under a scaling CTM.
pub(crate) fn draw_svg(surface: &mut Surface<'_>, tree: &SvgTree, shape: &ImageShape) {
    // Tree dimensions are validated > 0 at parse time.
    let sx = (shape.w / tree.width) as f32;
    let sy = (shape.h / tree.height) as f32;
    surface.push_transform(&Transform::from_row(
        sx,
        0.0,
        0.0,
        sy,
        shape.x as f32,
        shape.y as f32,
    ));
    for path in &tree.paths {
        surface.set_fill(path.fill.as_ref().map(crate::paint::svg_fill));
        surface.set_stroke(
            path.stroke
                .map(|color| solid_stroke(color, path.stroke_width, 1.0)),
        );
        if let Some(built) = svg_path(&path.cmds) {
            surface.draw_path(&built);
        }
    }
    surface.pop();
}

/// Builds a krilla path from flattened SVG commands; `None` when the
/// command list forms no drawable path.
pub(crate) fn svg_path(cmds: &[PathCmd]) -> Option<Path> {
    let mut pb = PathBuilder::new();
    for cmd in cmds {
        match *cmd {
            PathCmd::MoveTo(x, y) => pb.move_to(x as f32, y as f32),
            PathCmd::LineTo(x, y) => pb.line_to(x as f32, y as f32),
            PathCmd::CurveTo(x1, y1, x2, y2, x, y) => pb.cubic_to(
                x1 as f32, y1 as f32, x2 as f32, y2 as f32, x as f32, y as f32,
            ),
            PathCmd::Close => pb.close(),
        }
    }
    pb.finish()
}

/// Maps a krilla image rejection. Named so the error path is directly
/// unit-testable.
pub(crate) fn bad_image_error(id: &str, reason: &str) -> RenderError {
    RenderError::BadImage {
        id: id.to_string(),
        reason: reason.to_string(),
    }
}

/// Builds a closed rectangle path; `None` for degenerate coordinates.
pub(crate) fn rect_path(x: f64, y: f64, w: f64, h: f64) -> Option<Path> {
    let mut pb = PathBuilder::new();
    pb.move_to(x as f32, y as f32);
    pb.line_to((x + w) as f32, y as f32);
    pb.line_to((x + w) as f32, (y + h) as f32);
    pb.line_to(x as f32, (y + h) as f32);
    pb.close();
    pb.finish()
}

/// The outline of a box: the plain rectangle when the corners are
/// square, else the layout-built rounded path. Keeping both behind one
/// call means the fill, the stroke and the clip of a rounded box all
/// follow exactly the same curve.
pub(crate) fn box_path(x: f64, y: f64, w: f64, h: f64, radius: Corners) -> Option<Path> {
    if radius.is_square() {
        return rect_path(x, y, w, h);
    }
    svg_path(&rounded_rect_cmds(x, y, w, h, radius))
}

/// The krilla dash for a layout dash pattern. Both intervals are
/// strictly positive by construction (see the layout side's floor), and
/// the phase is 0 so a pattern starts painted at the path's first point.
pub(crate) fn dash_of(dash: Option<Dash>) -> Option<StrokeDash> {
    let Dash { on, off } = dash?;
    // krilla forwards the array to tiny-skia, which REJECTS a
    // non-positive or non-finite interval by dropping the whole stroke.
    // Falling back to solid keeps a hand-built tree visible.
    (on.is_finite() && on > 0.0 && off.is_finite() && off > 0.0).then(|| StrokeDash {
        array: vec![on as f32, off as f32],
        offset: 0.0,
    })
}

/// Builds a single segment path; `None` for degenerate coordinates.
pub(crate) fn line_path(x1: f64, y1: f64, x2: f64, y2: f64) -> Option<Path> {
    let mut pb = PathBuilder::new();
    pb.move_to(x1 as f32, y1 as f32);
    pb.line_to(x2 as f32, y2 as f32);
    pb.finish()
}

/// A solid fill at the given paint alpha (`opacity`). Layout clamps
/// opacity to `0..=1`; the guard covers hand-built trees.
pub(crate) fn solid_fill(color: (f32, f32, f32), opacity: f32) -> Fill {
    Fill {
        paint: rgb_color(color).into(),
        opacity: norm_opacity(opacity),
        rule: Default::default(),
    }
}

pub(crate) fn solid_stroke(color: (f32, f32, f32), width: f64, opacity: f32) -> Stroke {
    Stroke {
        paint: rgb_color(color).into(),
        width: width as f32,
        opacity: norm_opacity(opacity),
        ..Default::default()
    }
}

/// A round-capped, round-joined stroke for form-mark paths (`ellipse`,
/// `checkbox` check) — butt caps / miter joins read as broken there.
pub(crate) fn round_stroke(color: (f32, f32, f32), width: f64, opacity: f32) -> Stroke {
    Stroke {
        line_cap: LineCap::Round,
        line_join: LineJoin::Round,
        ..solid_stroke(color, width, opacity)
    }
}

fn norm_opacity(opacity: f32) -> NormalizedF32 {
    NormalizedF32::new(opacity.clamp(0.0, 1.0)).unwrap_or(NormalizedF32::ONE)
}

pub(crate) fn rgb_color((r, g, b): (f32, f32, f32)) -> rgb::Color {
    rgb::Color::new(channel(r), channel(g), channel(b))
}

/// Layout colors are 0..=1 floats (hex-derived, so exact multiples of
/// 1/255); krilla takes 8-bit channels.
pub(crate) fn channel(value: f32) -> u8 {
    (value.clamp(0.0, 1.0) * 255.0).round() as u8
}
