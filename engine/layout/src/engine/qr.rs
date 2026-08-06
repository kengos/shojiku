//! QR code items: content is encoded at *layout* time and emitted
//! as run-length-merged module [`RectShape`]s — no tree/renderer/asset
//! change, which is what lets a `qr_code` work inside `repeat` cells
//! with element-scoped bindings on day one. The engine encodes whatever
//! string it is given (URL / number / opaque token — no semantics).

use crate::tree::{LayoutItem, RectShape};
use qrcodegen::{QrCode, QrCodeEcc};
use shojiku_core::{EcLevel, QrCodeItem};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::{placed_box, with_vertical_margin, Atom, Basis, Ctx, BLACK};

/// Cap on the encoded content size. Params are untrusted; module count
/// grows with content, and every dark module run becomes a tree item —
/// this bounds that fan-out (a v40 code tops out at 2,953 bytes; real
/// pickup tokens/URLs sit far below 1 KiB).
pub(super) const MAX_QR_CONTENT_BYTES: usize = 1024;

/// The ISO 18004 quiet zone, in modules, kept *inside* the drawn square
/// on every side so the authored box is the full scannable footprint.
const QUIET_ZONE_MODULES: f64 = 4.0;

/// Below this module size scanners get unreliable at print resolution;
/// the code still draws, with a `qr_module_too_small` warning.
const MIN_MODULE_PT: f64 = 1.0;

impl<'a, 'b> Ctx<'a, 'b> {
    /// Builds a QR atom: resolves the content (scope-aware, like text),
    /// encodes, and centers the code square (quiet zone included) in the
    /// content box. Decoration paints under the modules — a
    /// `backgroundColor` is the usual white backing.
    pub(super) fn qr_atom(&mut self, qr: &QrCodeItem, basis: &Basis) -> Option<Atom> {
        let b = qr.box_.clone().unwrap_or_default();
        let rb = self.resolve_box(&b, basis);
        let (Some(w), Some(h)) = (rb.w, rb.h) else {
            self.diags.push(Diagnostic::new(Code::QrMissingSize));
            return None;
        };
        let (cw, ch) = (rb.content_w(w), rb.content_h(h));
        if !(cw.is_finite() && cw > 0.0 && ch.is_finite() && ch > 0.0) {
            self.diags.push(Diagnostic::new(Code::QrMissingSize));
            return None;
        }
        let Some(content) =
            self.resolve_content(qr.text.as_deref(), qr.data.as_ref(), &qr.bindings)
        else {
            self.diags.push(Diagnostic::new(Code::EmptyQrCodeItem));
            return None;
        };
        if content.is_empty() {
            self.diags.push(Diagnostic::new(Code::EmptyQrCodeItem));
            return None;
        }
        if content.len() > MAX_QR_CONTENT_BYTES {
            self.diags.push(
                Diagnostic::new(Code::QrContentTooLong)
                    .arg("bytes", content.len())
                    .arg("max", MAX_QR_CONTENT_BYTES),
            );
            return None;
        }
        let side = cw.min(ch);
        let computed = self.resolve_style(&qr.style_names, &qr.style);
        let mut items = Vec::new();
        self.push_decoration(&mut items, &computed, rb.x, w, h);
        // The code square (quiet zone included) centers in the content box.
        self.qr_modules(
            &content,
            qr.error_correction(),
            rb.content_x() + (cw - side) / 2.0,
            rb.padding[0] + (ch - side) / 2.0,
            side,
            &mut items,
        );

        let boxes = vec![placed_box(
            &self.current_path(),
            qr.id.as_deref(),
            &rb,
            w,
            h,
        )];
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
}

impl<'a, 'b> Ctx<'a, 'b> {
    /// Encodes `content` and pushes the module rects of a `side`-pt code
    /// square whose top-left is `(x, y)` (quiet zone inside). Shared by
    /// the `qr_code` item and qr table cells; empty and over-cap
    /// content warn and draw nothing.
    pub(super) fn qr_modules(
        &mut self,
        content: &str,
        ec: EcLevel,
        x: f64,
        y: f64,
        side: f64,
        items: &mut Vec<LayoutItem>,
    ) {
        if content.is_empty() {
            self.diags.push(Diagnostic::new(Code::EmptyQrCodeItem));
            return;
        }
        if content.len() > MAX_QR_CONTENT_BYTES {
            self.diags.push(
                Diagnostic::new(Code::QrContentTooLong)
                    .arg("bytes", content.len())
                    .arg("max", MAX_QR_CONTENT_BYTES),
            );
            return;
        }
        let ecc = match ec {
            EcLevel::Low => QrCodeEcc::Low,
            EcLevel::Medium => QrCodeEcc::Medium,
            EcLevel::Quartile => QrCodeEcc::Quartile,
            EcLevel::High => QrCodeEcc::High,
        };
        // The content cap (1024 B) sits below v40's byte capacity at the
        // highest error-correction level (1,273 B), so encoding cannot
        // overflow; a hypothetical failure degrades to drawing nothing
        // (no panic path; single line so the guard stays coverable).
        let Some(code) = QrCode::encode_text(content, ecc).ok() else { return };
        let total_modules = f64::from(code.size()) + 2.0 * QUIET_ZONE_MODULES;
        let module = side / total_modules;
        if module < MIN_MODULE_PT {
            self.diags.push(
                Diagnostic::new(Code::QrModuleTooSmall)
                    .arg("module", module)
                    .arg("min", MIN_MODULE_PT),
            );
        }
        push_modules(
            items,
            &code,
            module,
            x + QUIET_ZONE_MODULES * module,
            y + QUIET_ZONE_MODULES * module,
        );
    }
}

/// Emits the dark modules as filled rects, merging horizontal runs so a
/// row of `n` adjacent modules is one rect (bounds item count and PDF
/// size; a solid finder row is one rect, not seven).
fn push_modules(items: &mut Vec<LayoutItem>, code: &QrCode, module: f64, ox: f64, oy: f64) {
    let size = code.size();
    for y in 0..size {
        let mut x = 0;
        while x < size {
            if !code.get_module(x, y) {
                x += 1;
                continue;
            }
            let run_start = x;
            while x < size && code.get_module(x, y) {
                x += 1;
            }
            items.push(LayoutItem::Rect(RectShape {
                x: ox + f64::from(run_start) * module,
                y: oy + f64::from(y) * module,
                w: f64::from(x - run_start) * module,
                h: module,
                stroke: None,
                stroke_width: 0.0,
                fill: Some(BLACK),
                // QR modules stay opaque regardless of style — a
                // semi-transparent code risks unscannable output.
                opacity: 1.0,
                ..Default::default()
            }));
        }
    }
}
