//! Per-page vertical extents of a paginating item's placed atoms, emitted
//! as the item's own `PlacedBox` fragments (one per page it spans). Shared
//! by `table`, `repeat`, and `repeat_flow`: an item that accepts an `id:`
//! but delegates its content to child atoms still needs a box-index
//! placement of its own so the Designer can address the item itself.

use crate::boxes::{BoxRect, PlacedBox};

use super::decoration::{self, push_side_borders};
use super::flow::FlowLayouter;

/// The page fragments accumulated as an item's atoms land: `(page, y0, y1)`
/// in absolute page coordinates (pt, top-left origin). Border == content:
/// these items carry no box-model padding of their own.
#[derive(Default)]
pub(in crate::engine) struct Fragments {
    spans: Vec<(usize, f64, f64)>,
}

impl Fragments {
    /// Records where the atom just placed by `layouter.place` landed
    /// (the `layouter.place` path: `table` rows, `repeat_flow` cards).
    /// A truncated layouter placed nothing, so nothing is recorded;
    /// same-page atoms merge into one span (inter-atom gaps absorbed).
    pub(in crate::engine) fn track(&mut self, layouter: &FlowLayouter, height: f64) {
        if layouter.truncated {
            return;
        }
        let page = layouter.pages.len() - 1;
        let y1 = layouter.cursor;
        match self.spans.last_mut() {
            Some((p, _, end)) if *p == page => *end = y1,
            _ => self.spans.push((page, y1 - height, y1)),
        }
    }

    /// Extends `page`'s fragment to include `[y0, y1]` (the direct
    /// page-write path: `repeat` cells write pages themselves rather than
    /// going through `layouter.place`, so there is no cursor to read).
    /// Unions with any existing span for the same page.
    pub(in crate::engine) fn cover(&mut self, page: usize, y0: f64, y1: f64) {
        match self.spans.iter_mut().find(|(p, _, _)| *p == page) {
            Some((_, lo, hi)) => {
                *lo = lo.min(y0);
                *hi = hi.max(y1);
            }
            None => self.spans.push((page, y0, y1)),
        }
    }

    /// Pushes one `PlacedBox` per page fragment (border == content).
    /// `path` addresses the item; `id` is its authored `id:` when present.
    /// No spans (nothing placed) emits nothing — a legitimately
    /// box-less path the box-index consumer must tolerate.
    pub(in crate::engine) fn emit(
        &self,
        path: &str,
        id: Option<&str>,
        x: f64,
        w: f64,
        layouter: &mut FlowLayouter,
    ) {
        for (page, y0, y1) in &self.spans {
            if let Some(p) = layouter.pages.get_mut(*page) {
                let rect = BoxRect {
                    x,
                    y: *y0,
                    w,
                    h: y1 - y0,
                };
                p.boxes.push(PlacedBox {
                    path: path.to_string(),
                    id: id.map(str::to_string),
                    border: rect,
                    content: rect,
                    text: None,
                });
            }
        }
    }

    /// Draws an outer frame around every page fragment (over the grid —
    /// same-color overdraw is invisible, differing widths read as the
    /// frame). Page-fragment edges get the frame too, marking where the
    /// item continues. Only `table` uses this today.
    pub(in crate::engine) fn draw_frame(
        &self,
        outer: &decoration::SideBorders,
        x: f64,
        w: f64,
        layouter: &mut FlowLayouter,
    ) {
        for (page, y0, y1) in &self.spans {
            if let Some(p) = layouter.pages.get_mut(*page) {
                push_side_borders(&mut p.items, outer, (x, *y0, w, y1 - *y0), 1.0);
            }
        }
    }
}
