//! Row and header atom building: measure/render-consistent cell text
//! blocks (border-box cell padding, so cell decoration covers the full
//! cell), the row-band decoration, the grid stroke, and the per-cell
//! `PlacedBox`es. This file is the module root: the prepared-cell types
//! plus `row_atom`; preparing cells from columns lives in `prepare`, the
//! container-cell (`cell:` column) arm in `cell`, and auto-row height
//! measurement in `measure`.

mod cell;
mod measure;
mod prepare;

use crate::boxes::{BoxRect, PlacedBox};
use crate::style::ComputedStyle;
use crate::tree::{LayoutItem, LineShape, RectShape};
use shojiku_core::{ContainerItem, ImageFit, VerticalAlign, WritingMode};

use super::super::{Atom, Ctx, Scope};
use super::TableFrame;

/// One prepared cell: resolved geometry, content, and style.
pub(super) struct Cell<'i> {
    pub(super) width: f64,
    pub(super) content: CellContent<'i>,
    pub(super) computed: ComputedStyle,
    pub(super) id: Option<String>,
    /// How the cell is addressed structurally.
    pub(super) path: CellPath,
}

/// A cell's structural address: **where the cell's CONTENT is authored**,
/// which is what both a diagnostic about that content and the cell's box
/// placement should name. One address per cell serves both, so the box
/// index and the diagnostics can never disagree about where a cell lives.
pub(super) enum CellPath {
    /// The content comes from column `n` (a body cell's binding, a label).
    /// A warning raised inside it names `columns[n]`, and a `mergeEmptyCells`
    /// cell keeps that even after growing over its empty neighbours: the
    /// binding to fix is still that column's.
    Column(usize),
    /// The content comes from `headerGroups[n]` — authored on the group,
    /// not on any of the columns it spans, so it is addressed as the group
    /// rather than posing as its leftmost column (which would open that
    /// column's editor and share its box path).
    Group(usize),
    /// The cell is synthesized by layout, not authored anywhere: the
    /// trailing region no `headerGroups` entry covers, and the all-empty
    /// row `mergeEmptyCells` collapses into one full-width cell. It has no
    /// address to claim, so it emits no box (a click falls through to the
    /// table) and its diagnostics stay on the table item.
    Synthesized,
}

impl CellPath {
    /// This cell's address relative to the table: the segment the box
    /// index appends AND the one the walk descends into, or `None` for a
    /// synthesized cell that is authored nowhere.
    fn segment(&self) -> Option<String> {
        match self {
            Self::Column(col) => Some(format!("columns[{col}]")),
            Self::Group(index) => Some(format!("headerGroups[{index}]")),
            Self::Synthesized => None,
        }
    }
}

/// What a cell draws: formatted text, a layout-time QR square, a
/// per-element image asset, or a whole `cell:` sub-template.
pub(super) enum CellContent<'i> {
    Text(String),
    Qr(String),
    Image {
        asset_id: String,
        fit: ImageFit,
    },
    /// A `cell:` column's sub-template plus the row scope its bindings
    /// read. Unlike the other three it can grow the row: an auto row is
    /// as tall as its tallest cell.
    Cell {
        item: &'i ContainerItem,
        scope: Scope,
    },
}

impl<'a, 'b> Ctx<'a, 'b> {
    /// Builds one table row from prepared cells: measure (unless the
    /// height is fixed), row-band decoration, cell content, grid stroke,
    /// and cell placements.
    pub(super) fn row_atom(
        &mut self,
        frame: &TableFrame,
        fixed: Option<f64>,
        cells: &[Cell],
        decor: &ComputedStyle,
    ) -> Atom {
        let (region_x, grid) = (frame.x, &frame.grid);
        let (min_h, padding) = (frame.geom.min, frame.geom.padding);
        let total_w: f64 = cells.iter().map(|c| c.width).sum();
        // A fixed height skips measurement (overflow is the cell policy's
        // job); otherwise the row is as tall as its tallest cell.
        let row_h = match fixed {
            Some(h) => h,
            None => self.measure_row(cells, region_x, (min_h, padding)),
        };

        // Row-band decoration (row/header fill and border) under the
        // cells, then each cell's content, whose own decoration (column
        // fills/borders) covers the full cell.
        let mut items = Vec::new();
        self.push_decoration(&mut items, decor, region_x, total_w, row_h);
        let mut boxes = Vec::new();
        // An authored cell is addressable as `<table>.<its own address>`
        // (one box per cell per row — a repeated path, like a repeat cell
        // per element); a synthesized one emits none.
        let table_path = self.current_path();
        let mut cx = region_x;
        for cell in cells {
            // Descend into the cell's own address so anything it reports
            // (overflow, a non-text cell's asset problem, a `cell:`
            // sub-template's children) names that column or header group
            // rather than the whole table.
            let segment = cell.path.segment();
            let mark = segment.clone().map(|seg| self.enter_item(seg));
            match &cell.content {
                // Cells use row/column geometry, not box min/max.
                CellContent::Text(text) => {
                    let atom = if cell.computed.writing_mode == WritingMode::VerticalRl {
                        // A vertical-writing cell fills the row rectangle: columns wrap
                        // against the row's content height (the measured row
                        // is tall enough for the longest column — see
                        // `measure_row` — so this never re-wraps). The
                        // table's default `verticalAlign: Middle` is a
                        // table-owned default, not an authored knob, so
                        // neutralize it to `Top` before the block builder
                        // maps it (CSS-logically) to a column-stack shift —
                        // otherwise every vertical cell's columns would
                        // center on a default the author never set.
                        let mut computed = cell.computed.clone();
                        computed.vertical_align = VerticalAlign::Top;
                        self.vertical_text_block(
                            text,
                            &computed,
                            cx,
                            cell.width,
                            Some(row_h),
                            row_h,
                            [padding; 4],
                        )
                    } else {
                        self.text_block(
                            text,
                            &cell.computed,
                            cx,
                            cell.width,
                            Some(row_h),
                            [padding; 4],
                            (None, None),
                        )
                    };
                    items.extend(atom.items);
                }
                CellContent::Qr(content) => {
                    let content = content.clone();
                    self.cell_qr(cell, &content, (cx, row_h, padding), &mut items);
                }
                CellContent::Image { asset_id, fit } => {
                    let (asset_id, fit) = (asset_id.clone(), *fit);
                    self.cell_image(cell, &asset_id, fit, (cx, row_h, padding), &mut items);
                }
                CellContent::Cell { item, scope } => {
                    let pair = (*item, scope.clone());
                    self.cell_container(cell, pair, (cx, row_h), (&mut items, &mut boxes));
                }
            }
            if let Some(mark) = mark {
                self.leave_item(mark);
            }
            if let Some(segment) = &segment {
                boxes.push(cell_box(
                    &format!("{table_path}.{segment}"),
                    cell.id.as_deref(),
                    cx,
                    cell.width,
                    row_h,
                    padding,
                ));
            }
            cx += cell.width;
        }

        if grid.width > 0.0 {
            items.push(LayoutItem::Rect(RectShape {
                x: region_x,
                y: 0.0,
                w: total_w,
                h: row_h,
                stroke: Some(grid.color),
                stroke_width: grid.width,
                fill: None,
                // Grid borders draw opaque; per-cell paint opacity comes
                // from the cell style via `text_block`/`push_decoration`.
                opacity: 1.0,
                ..Default::default()
            }));
            let mut bx = region_x;
            for cell in &cells[..cells.len().saturating_sub(1)] {
                bx += cell.width;
                items.push(LayoutItem::Line(LineShape {
                    x1: bx,
                    y1: 0.0,
                    x2: bx,
                    y2: row_h,
                    width: grid.width,
                    color: grid.color,
                    opacity: 1.0,
                    ..Default::default()
                }));
            }
        }

        Atom {
            height: row_h,
            items,
            boxes,
            rb: None,
        }
    }
}

/// A cell placement (one per authored cell per row): border box = the
/// cell, content box = the cell inset by the cell padding. `path` is the
/// cell's structural address (`columns[n]` or `headerGroups[n]`); `id` its
/// authored column `id:` if any (a header group authors none).
fn cell_box(path: &str, id: Option<&str>, x: f64, w: f64, h: f64, padding: f64) -> PlacedBox {
    PlacedBox {
        path: path.to_string(),
        id: id.map(str::to_string),
        border: BoxRect { x, y: 0.0, w, h },
        content: BoxRect {
            x: x + padding,
            y: padding,
            w: (w - padding * 2.0).max(0.0),
            h: (h - padding * 2.0).max(0.0),
        },
        text: None,
        hidden: false,
    }
}
