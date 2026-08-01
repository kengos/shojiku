//! Image drawing for the PNG painter: raster embed (decoded RGBA) and
//! SVG vector playback, both under the active clip mask.

use super::{build_path, rgb, Painter};
use crate::RenderPngError;
use shojiku_image::{decode_raster, AssetKind, RgbaImage, SvgTree};
use shojiku_layout::ImageShape;
use tiny_skia::{FillRule, Mask, Paint, Pixmap, PixmapPaint, Stroke, Transform};

impl Painter<'_> {
    pub(crate) fn draw_image(
        &self,
        pixmap: &mut Pixmap,
        shape: &ImageShape,
        mask: Option<&Mask>,
    ) -> Result<(), RenderPngError> {
        let asset = self
            .assets
            .get(&shape.asset_id)
            .ok_or_else(|| RenderPngError::UnknownAsset(shape.asset_id.clone()))?;
        if !(shape.w.is_finite() && shape.w > 0.0 && shape.h.is_finite() && shape.h > 0.0) {
            return Ok(());
        }
        match &asset.kind {
            AssetKind::Svg(tree) => {
                self.draw_svg(pixmap, tree, shape, mask);
                Ok(())
            }
            AssetKind::Raster { format, bytes, .. } => {
                let image = decode_raster(*format, bytes).map_err(|e| RenderPngError::Decode {
                    id: shape.asset_id.clone(),
                    reason: e.to_string(),
                })?;
                self.draw_raster(pixmap, &image, shape, mask);
                Ok(())
            }
        }
    }

    pub(crate) fn draw_svg(
        &self,
        pixmap: &mut Pixmap,
        tree: &SvgTree,
        shape: &ImageShape,
        mask: Option<&Mask>,
    ) {
        // `opacity` is a group over the whole vector image: render the
        // paths onto a transparent layer, then composite the layer with the
        // alpha (matching the PDF backend's `push_opacity`), so overlapping
        // paths don't double-blend at their seams. `1.0` draws in place;
        // if the layer allocation fails (cannot happen while the target
        // pixmap exists) the `None` arm also draws in place — opaque, never
        // invisible, the same degrade policy as `invalid_opacity`.
        match (shape.opacity < 1.0)
            .then(|| Pixmap::new(pixmap.width(), pixmap.height()))
            .flatten()
        {
            Some(mut layer) => {
                self.draw_svg_paths(&mut layer, tree, shape, None);
                let paint = PixmapPaint {
                    opacity: shape.opacity.clamp(0.0, 1.0),
                    ..Default::default()
                };
                pixmap.draw_pixmap(0, 0, layer.as_ref(), &paint, Transform::identity(), mask);
            }
            None => self.draw_svg_paths(pixmap, tree, shape, mask),
        }
    }

    fn draw_svg_paths(
        &self,
        pixmap: &mut Pixmap,
        tree: &SvgTree,
        shape: &ImageShape,
        mask: Option<&Mask>,
    ) {
        // viewBox units -> draw box (pt) -> px. Composed into one matrix so
        // stroke widths scale with the image, matching the PDF backend.
        let sx = (shape.w / tree.width) as f32;
        let sy = (shape.h / tree.height) as f32;
        let transform = self
            .transform
            .pre_concat(Transform::from_translate(shape.x as f32, shape.y as f32))
            .pre_concat(Transform::from_scale(sx, sy));
        for path in &tree.paths {
            let Some(built) = build_path(&path.cmds, 0.0, 0.0) else {
                continue;
            };
            if let Some(paint) = path.fill.as_ref().and_then(super::gradient::svg_paint) {
                pixmap.fill_path(&built, &paint, FillRule::Winding, transform, mask);
            }
            if let Some(color) = path.stroke {
                let mut paint = Paint::default();
                paint.set_color(rgb(color));
                paint.anti_alias = true;
                let stroke = Stroke {
                    width: path.stroke_width as f32,
                    ..Default::default()
                };
                pixmap.stroke_path(&built, &paint, &stroke, transform, mask);
            }
        }
    }

    pub(crate) fn draw_raster(
        &self,
        pixmap: &mut Pixmap,
        image: &RgbaImage,
        shape: &ImageShape,
        mask: Option<&Mask>,
    ) {
        let Some(source) = pixmap_from_rgba(image) else {
            return;
        };
        // Map the intrinsic pixmap rect onto the draw box in px.
        let transform = self
            .transform
            .pre_concat(Transform::from_translate(shape.x as f32, shape.y as f32))
            .pre_concat(Transform::from_scale(
                (shape.w / f64::from(image.width)) as f32,
                (shape.h / f64::from(image.height)) as f32,
            ));
        let paint = PixmapPaint {
            quality: tiny_skia::FilterQuality::Bilinear,
            // Whole-image alpha; a single raster is one unit, so this
            // matches the PDF backend's group `push_opacity`.
            opacity: shape.opacity.clamp(0.0, 1.0),
            ..Default::default()
        };
        pixmap.draw_pixmap(0, 0, source.as_ref(), &paint, transform, mask);
    }
}

/// Builds a tiny-skia [`Pixmap`] from straight-alpha RGBA8, premultiplying
/// as tiny-skia requires. `None` if the buffer length disagrees with the
/// dimensions (a corrupt decode) rather than panicking.
pub(crate) fn pixmap_from_rgba(image: &RgbaImage) -> Option<Pixmap> {
    let expected = (image.width as usize)
        .checked_mul(image.height as usize)?
        .checked_mul(4)?;
    if image.rgba.len() != expected {
        return None;
    }
    let mut premul = Vec::with_capacity(image.rgba.len());
    for px in image.rgba.chunks_exact(4) {
        let a = u16::from(px[3]);
        let mul = |c: u8| ((u16::from(c) * a + 127) / 255) as u8;
        premul.extend_from_slice(&[mul(px[0]), mul(px[1]), mul(px[2]), px[3]]);
    }
    let size = tiny_skia::IntSize::from_wh(image.width, image.height)?;
    Pixmap::from_vec(premul, size)
}
