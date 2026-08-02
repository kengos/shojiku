//! QR code items end to end (`src/engine/qr.rs`): geometry (`geometry`)
//! and hostile-input guards (`guards`).

use crate::common::*;

pub(super) fn qr_rects(page: &LayoutPage) -> Vec<&RectShape> {
    rect_shapes(page)
        .into_iter()
        .filter(|r| r.fill == Some((0.0, 0.0, 0.0)))
        .collect()
}

mod geometry;
mod guards;
