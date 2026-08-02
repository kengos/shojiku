//! Whole-item translation over the layout tree: shifting positioned
//! items vertically (flow cursor, margins) and horizontally (flex
//! placement), recursing into clip groups.

use crate::tree::LayoutItem;

pub(super) fn translate(items: &[LayoutItem], dy: f64) -> Vec<LayoutItem> {
    items
        .iter()
        .cloned()
        .map(|item| match item {
            LayoutItem::Text(mut t) => {
                for line in &mut t.lines {
                    line.y += dy;
                }
                LayoutItem::Text(t)
            }
            LayoutItem::Rect(mut r) => {
                r.y += dy;
                LayoutItem::Rect(r)
            }
            LayoutItem::Line(mut l) => {
                l.y1 += dy;
                l.y2 += dy;
                LayoutItem::Line(l)
            }
            LayoutItem::Image(mut i) => {
                i.y += dy;
                LayoutItem::Image(i)
            }
            LayoutItem::Path(mut p) => {
                p.offset(0.0, dy);
                LayoutItem::Path(p)
            }
            LayoutItem::Clip(mut c) => {
                c.y += dy;
                c.items = translate(&c.items, dy);
                LayoutItem::Clip(c)
            }
        })
        .collect()
}

/// Horizontal companion to [`translate`]: flex placement shifts whole
/// atoms sideways (cross-axis alignment in a column, main-axis
/// placement in a row).
pub(super) fn translate_x(items: &[LayoutItem], dx: f64) -> Vec<LayoutItem> {
    items
        .iter()
        .cloned()
        .map(|item| match item {
            LayoutItem::Text(mut t) => {
                for line in &mut t.lines {
                    line.x += dx;
                }
                LayoutItem::Text(t)
            }
            LayoutItem::Rect(mut r) => {
                r.x += dx;
                LayoutItem::Rect(r)
            }
            LayoutItem::Line(mut l) => {
                l.x1 += dx;
                l.x2 += dx;
                LayoutItem::Line(l)
            }
            LayoutItem::Image(mut i) => {
                i.x += dx;
                LayoutItem::Image(i)
            }
            LayoutItem::Path(mut p) => {
                p.offset(dx, 0.0);
                LayoutItem::Path(p)
            }
            LayoutItem::Clip(mut c) => {
                c.x += dx;
                c.items = translate_x(&c.items, dx);
                LayoutItem::Clip(c)
            }
        })
        .collect()
}
