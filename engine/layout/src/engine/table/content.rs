//! Non-text cell rendering: `type: qr_code` / `type: image` columns
//! draw into the cell box (decoration + centered media), scaling to the
//! row height rather than driving it.

use crate::tree::{ClipShape, ImageShape, LayoutItem};
use shojiku_core::{EcLevel, ImageFit};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::super::atoms::fit_size;
use super::super::Ctx;
use super::rows::Cell;

impl<'a, 'b> Ctx<'a, 'b> {
    /// Cell decoration + the padded inner box; `None` when the inner box
    /// is degenerate (decoration only, nothing else to draw).
    fn cell_inner(
        &mut self,
        cell: &Cell<'_>,
        cx: f64,
        row_h: f64,
        padding: f64,
        items: &mut Vec<LayoutItem>,
    ) -> Option<(f64, f64)> {
        self.push_decoration(items, &cell.computed, cx, cell.width, row_h);
        let cw = cell.width - padding * 2.0;
        let ch = row_h - padding * 2.0;
        (cw.is_finite() && cw > 0.0 && ch.is_finite() && ch > 0.0).then_some((cw, ch))
    }

    /// Draws a qr cell (geometry = `(cell x, row height, padding)`): the
    /// code square scales to the smaller inner dimension, centered.
    pub(super) fn cell_qr(
        &mut self,
        cell: &Cell<'_>,
        content: &str,
        (cx, row_h, padding): (f64, f64, f64),
        items: &mut Vec<LayoutItem>,
    ) {
        let Some((cw, ch)) = self.cell_inner(cell, cx, row_h, padding, items) else { return };
        let side = cw.min(ch);
        self.qr_modules(
            content,
            EcLevel::default(),
            cx + padding + (cw - side) / 2.0,
            padding + (ch - side) / 2.0,
            side,
            items,
        );
    }

    /// Draws an image cell (geometry as in [`Self::cell_qr`]): the
    /// per-element asset fits the padded cell box; `cover`/`none`
    /// overflow is clipped (D2).
    pub(super) fn cell_image(
        &mut self,
        cell: &Cell<'_>,
        asset_id: &str,
        fit: ImageFit,
        (cx, row_h, padding): (f64, f64, f64),
        items: &mut Vec<LayoutItem>,
    ) {
        let Some((cw, ch)) = self.cell_inner(cell, cx, row_h, padding, items) else { return };
        let Some(asset) = self.input.assets.and_then(|assets| assets.get(asset_id)) else {
            self.diags
                .push(Diagnostic::new(Code::MissingAsset).arg("key", asset_id));
            return;
        };
        let (dw, dh) = fit_size(fit, asset.intrinsic_size(), cw, ch);
        let opacity = self.sane_opacity(cell.computed.opacity);
        let shape = LayoutItem::Image(ImageShape {
            asset_id: asset_id.to_string(),
            x: cx + padding + (cw - dw) / 2.0,
            y: padding + (ch - dh) / 2.0,
            w: dw,
            h: dh,
            opacity,
            link: None,
        });
        if dw > cw + 0.01 || dh > ch + 0.01 {
            items.push(LayoutItem::Clip(ClipShape {
                x: cx + padding,
                y: padding,
                w: cw,
                h: ch,
                items: vec![shape],
                ..Default::default()
            }));
        } else {
            items.push(shape);
        }
    }
}
