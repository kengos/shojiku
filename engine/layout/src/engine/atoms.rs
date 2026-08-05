//! Leaf item atoms: rect, image (contain/cover/stretch/none fit against
//! the prepared asset store; cover/none clipped to the box, and every SVG
//! clipped to it whatever the fit), and line.

use crate::tree::{ClipShape, ImageShape, LayoutItem, LineShape};
use shojiku_core::{BorderStyleKind, ImageFit, ImageItem, RectItem};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};
use shojiku_image::asset_key;

use super::{placed_box, with_vertical_margin, Atom, Basis, Ctx};

/// Splits a `double` line into the two parallel strokes CSS draws: each a
/// third of the authored width, their centres a third of the width either
/// side of the authored geometry (so the pair spans the same band a solid
/// stroke would). The offset is along the line's NORMAL, so a diagonal
/// `line` doubles correctly rather than only an axis-aligned one; a
/// zero-length line has no normal and stays a single stroke.
fn double_lines(stroke: &LineShape) -> Vec<LayoutItem> {
    let (dx, dy) = (stroke.x2 - stroke.x1, stroke.y2 - stroke.y1);
    let len = dx.hypot(dy);
    let third = stroke.width / 3.0;
    if !len.is_finite() || len <= 0.0 || !third.is_finite() {
        return vec![LayoutItem::Line(stroke.clone())];
    }
    // Unit normal, scaled to the centre-to-centre offset.
    let (nx, ny) = (-dy / len * third, dx / len * third);
    [1.0_f64, -1.0]
        .into_iter()
        .map(|sign| {
            LayoutItem::Line(LineShape {
                x1: stroke.x1 + nx * sign,
                y1: stroke.y1 + ny * sign,
                x2: stroke.x2 + nx * sign,
                y2: stroke.y2 + ny * sign,
                width: third,
                ..stroke.clone()
            })
        })
        .collect()
}

/// `object-fit` math (CSS): the drawn size for an `iw × ih` asset in a
/// `cw × ch` content box. Aspect-preserving: `contain` fits inside
/// (letterbox), `cover` fills and overflows (min vs max scale). Shared
/// by image items and image table cells.
pub(super) fn fit_size(fit: ImageFit, (iw, ih): (f64, f64), cw: f64, ch: f64) -> (f64, f64) {
    match fit {
        ImageFit::Contain => {
            let scale = (cw / iw).min(ch / ih);
            (iw * scale, ih * scale)
        }
        ImageFit::Cover => {
            let scale = (cw / iw).max(ch / ih);
            (iw * scale, ih * scale)
        }
        ImageFit::Stretch => (cw, ch),
        ImageFit::None => (iw, ih),
    }
}

impl<'a, 'b> Ctx<'a, 'b> {
    /// Builds a rect atom: a pure decoration box painted by the unified
    /// `Style` through `push_decoration` (backgroundColor fill, per-side
    /// or uniform borders, `solid`/`double`), exactly like a container's
    /// or image's decoration — a bare rect draws nothing. `box.padding`
    /// is ignored — a rect has no content to inset (border-box, the
    /// stroke *is* the box).
    pub(super) fn rect_atom(&mut self, rect: &RectItem, basis: &Basis) -> Option<Atom> {
        let rb = self.resolve_box(&rect.box_, basis);
        let (Some(w), Some(h)) = (rb.w, rb.h) else {
            self.diags.push(Diagnostic::new(Code::RectMissingSize));
            return None;
        };
        let computed = self.resolve_style(&rect.style_names, &rect.style);
        let mut items = Vec::new();
        self.push_decoration(&mut items, &computed, rb.x, w, h);
        // A rect has no content box (padding is ignored): report content
        // == border so the GUI never draws a phantom inset.
        let mut b = placed_box(&self.current_path(), rect.id.as_deref(), &rb, w, h);
        b.content = b.border;
        let boxes = vec![b];
        Some(with_vertical_margin(
            Atom {
                height: h,
                items,
                boxes,
                rb: Some(rb),
            },
            rb.margin[0],
            rb.margin[2],
        ))
    }

    /// Builds an image atom: reserves the item's box (border-box: padding
    /// insets the fit area, the reserved height stays `box.h`), fitting
    /// the asset's intrinsic size into it per `fit` (contain/cover/
    /// stretch/none) — cover/none crop to the content box with a clip,
    /// as does every SVG regardless of fit.
    /// The final draw rect goes into the tree so renderers never re-measure.
    pub(super) fn image_atom(&mut self, image: &ImageItem, basis: &Basis) -> Option<Atom> {
        let key = asset_key(image);
        self.image_atom_keyed(image, basis, key)
    }

    /// Image atom with a pre-resolved asset key. Scalar placements pass
    /// the item's own `src:`/`dyn:` key; a `repeat`/`repeat_flow` cell
    /// passes the element-scoped `dyn:<array>[<i>].<key>` (static `src:`
    /// stays shared). `None` = the item sets neither `src` nor `data`.
    pub(super) fn image_atom_keyed(
        &mut self,
        image: &ImageItem,
        basis: &Basis,
        key: Option<String>,
    ) -> Option<Atom> {
        let b = image.box_.clone().unwrap_or_default();
        let rb = self.resolve_box(&b, basis);
        let (Some(w), Some(h)) = (rb.w, rb.h) else {
            self.diags.push(Diagnostic::new(Code::ImageMissingSize));
            return None;
        };
        // The content box the asset fits into (border-box minus padding).
        let (cw, ch) = (rb.content_w(w), rb.content_h(h));
        // Templates are untrusted: degenerate boxes would poison the fit
        // math (0/0, infinities) and the renderer's transform.
        if !(cw.is_finite() && cw > 0.0 && ch.is_finite() && ch > 0.0) {
            self.diags.push(Diagnostic::new(Code::ImageMissingSize));
            return None;
        }
        let Some(key) = key else {
            self.diags.push(Diagnostic::new(Code::EmptyImageItem));
            return None;
        };
        let Some(asset) = self.input.assets.and_then(|assets| assets.get(&key)) else {
            self.diags
                .push(Diagnostic::new(Code::MissingAsset).arg("key", key));
            return None;
        };
        // Intrinsic dimensions are always positive (loading rejects zero
        // sizes), so the fit math cannot divide by zero.
        let (iw, ih) = asset.intrinsic_size();
        let clips_to_viewport = asset.clips_to_viewport();
        let (dw, dh) = fit_size(image.fit(), (iw, ih), cw, ch);
        let boxes = vec![placed_box(
            &self.current_path(),
            image.id.as_deref(),
            &rb,
            w,
            h,
        )];
        // Decoration (backgroundColor / border) covers the border box,
        // under the image (which draws inside the content box).
        let computed = self.resolve_style(&image.style_names, &image.style);
        let opacity = self.sane_opacity(computed.opacity);
        let mut items = Vec::with_capacity(2);
        self.push_decoration(&mut items, &computed, rb.x, w, h);
        let shape = LayoutItem::Image(ImageShape {
            asset_id: key,
            x: rb.content_x() + (cw - dw) / 2.0,
            y: rb.padding[0] + (ch - dh) / 2.0,
            w: dw,
            h: dh,
            opacity,
            link: self.resolve_link(image.link.as_ref(), &image.bindings),
        });
        // `cover`/`none` can exceed the content box; crop the overflow
        // with a D2 clip over the content box. A raster under
        // `contain`/`stretch` never overflows, so it stays a bare shape
        // (no needless clip node) — but an SVG is clipped either way: its
        // paths may sit outside the `viewBox` the fit math measured, and
        // the viewport clips them (`Asset::clips_to_viewport`).
        if clips_to_viewport || dw > cw + 0.01 || dh > ch + 0.01 {
            items.push(LayoutItem::Clip(ClipShape {
                x: rb.content_x(),
                y: rb.padding[0],
                w: cw,
                h: ch,
                items: vec![shape],
                ..Default::default()
            }));
        } else {
            items.push(shape);
        }
        Some(with_vertical_margin(
            Atom {
                height: h,
                items,
                boxes,
                rb: Some(rb),
            },
            rb.margin[0],
            rb.margin[2],
        ))
    }

    /// The `line` item. Its `style.style` shares the border wire's
    /// keywords: `dashed`/`dotted` ride the tree's dash pattern (the
    /// cut-here-line case), while `double` — which has no single-stroke
    /// form — becomes two parallel lines a third of the width each,
    /// offset either side of the authored geometry by a third of the
    /// width so the pair straddles it symmetrically.
    ///
    /// Endpoints are full `Length`s resolved against `basis`, the same
    /// box every sibling item resolves against: `x` against its width
    /// (offset from `basis.x`, so `"100%"` lands on the right edge), `y`
    /// against its height. An unresolvable endpoint — a `%` under an
    /// auto-height parent, or a hostile value past the resolve cap —
    /// falls back to 0 having already warned.
    pub(super) fn line_atom(&mut self, line: &shojiku_core::LineItem, basis: &Basis) -> Atom {
        let x1 = basis.x + self.resolve_x(Some(line.from.x), basis).unwrap_or(0.0);
        let x2 = basis.x + self.resolve_x(Some(line.to.x), basis).unwrap_or(0.0);
        let y1 = self.resolve_y(Some(line.from.y), basis).unwrap_or(0.0);
        let y2 = self.resolve_y(Some(line.to.y), basis).unwrap_or(0.0);
        // The reserved height floors at 0: a line whose endpoints both sit
        // ABOVE its origin would otherwise reserve a negative height and
        // walk the flow cursor backwards over already-placed content.
        let height = y1.max(y2).max(0.0);
        // Guarded BEFORE it is consumed, so the dash pattern and the
        // `double` split both derive from the clamped width.
        let width = self.sane_line_width(line.style.width());
        let stroke = LineShape {
            x1,
            y1,
            x2,
            y2,
            width,
            color: self.color_or_black(line.style.color.as_deref()),
            opacity: self.sane_opacity(line.style.opacity.unwrap_or(1.0)),
            dash: super::decoration::dash_pattern(line.style.style(), width),
        };
        let items = if line.style.style() == BorderStyleKind::Double {
            double_lines(&stroke)
        } else {
            vec![LayoutItem::Line(stroke)]
        };
        Atom {
            height,
            items,
            // Lines have no box model (from/to points); the placement is
            // the endpoint bounding box, zero-thickness when axis-aligned.
            boxes: vec![super::line_placed_box(
                &self.current_path(),
                line.id.as_deref(),
                (x1, y1),
                (x2, y2),
            )],
            rb: None,
        }
    }
}
