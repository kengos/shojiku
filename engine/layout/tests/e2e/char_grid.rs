//! `type: char_grid` end to end (`src/engine/char_grid.rs`): cell
//! placement (`cells`), end alignment (`align`), vertical writing
//! (`vertical`), ruby (`ruby`), sheet pagination (`paginate`), aozora
//! sheet breaks (`sheet_break`), and hostile-input guards (`guards`).

use crate::common::*;

mod align;
mod cells;
mod combine;
mod containers;
mod guards;
mod large;
mod paginate;
mod placement;
mod ruby;
mod sheet_break;
mod vertical;

/// The stroked cell rects (the マス目), distinct from fills.
pub(super) fn grid_rects(page: &LayoutPage) -> Vec<&RectShape> {
    rect_shapes(page)
        .into_iter()
        .filter(|r| r.stroke.is_some() && r.fill.is_none())
        .collect()
}

/// A one-item flow template on a margin-less custom page, with the
/// fixed-pitch face (every full-width glyph exactly 1em) so positions
/// are metric-exact.
pub(super) fn grid_template(page_w: f64, page_h: f64, item_lines: &str) -> String {
    format!(
        "page:\n  size: {{ w: {page_w}, h: {page_h} }}\n  margin: 0\nsections:\n  body:\n    type: flow\n    items:\n      - type: char_grid\n        style: {{ fontFamily: biz-ud-gothic, fontSize: 10 }}\n{item_lines}"
    )
}

/// The main cell block: the text block with the item's 10pt font size
/// (ruby blocks are smaller).
pub(super) fn main_block(page: &LayoutPage) -> &TextBlock {
    text_blocks(page)
        .into_iter()
        .find(|b| b.font_size == 10.0)
        .expect("main cell block")
}
