//! The structural path stack: addresses every laid-out item in the
//! validate-diagnostic grammar (`sections.body.items[3].items[0]`,
//! `…cell.items[1]`, `…columns[2]`) so `inspect` emits a stable
//! `PlacedBox.path` for id-less items too, not only id-carrying ones.

use crate::boxes::{BoxRect, PlacedBox};
use shojiku_layout_box::ResolvedBox;

/// Builds a `line` item's placement: the endpoint bounding box (content
/// == border, like `rect`). Axis-aligned lines report a zero-thickness
/// box — honest segment geometry; the stroke inks `width/2` beyond it,
/// and hit-test tolerance is the overlay's job. Shared by the flow/
/// container atom and the band / absolute-body inline arms.
pub(super) fn line_placed_box(
    path: &str,
    id: Option<&str>,
    (x1, y1): (f64, f64),
    (x2, y2): (f64, f64),
) -> PlacedBox {
    let rect = BoxRect {
        x: x1.min(x2),
        y: y1.min(y2),
        w: (x2 - x1).abs(),
        h: (y2 - y1).abs(),
    };
    PlacedBox {
        path: path.to_string(),
        id: id.map(str::to_string),
        border: rect,
        content: rect,
        text: None,
    }
}

/// Builds an item's placement from its resolved box and structural
/// `path`: `w`/`h` are the border-box size (y is atom-relative; the walks
/// shift it). `id` is the authored `id:` when present — a lookup alias;
/// the path addresses every item, id-carrying or not.
pub(super) fn placed_box(
    path: &str,
    id: Option<&str>,
    rb: &ResolvedBox,
    w: f64,
    h: f64,
) -> PlacedBox {
    PlacedBox {
        path: path.to_string(),
        id: id.map(str::to_string),
        border: BoxRect {
            x: rb.x,
            y: 0.0,
            w,
            h,
        },
        content: BoxRect {
            x: rb.content_x(),
            y: rb.padding[0],
            w: rb.content_w(w),
            h: rb.content_h(h),
        },
        text: None,
    }
}
