//! The bounded (non-paginating) table atom: a `table` rendered as
//! ONE stacked block for every context that is not the flow body — a
//! container child, an absolute body, a band, or a grid cell. Unlike
//! `place_table`, it never paginates; a too-tall table is the parent
//! box's overflow story (`container_overflow` / `overflow: hidden`).

use crate::boxes::translate_boxes;
use shojiku_core::TableItem;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::super::decoration::push_side_borders;
use super::super::{placed_box, translate, with_vertical_margin, Atom, Basis, Ctx};
use super::TableFrame;

impl<'a, 'b> Ctx<'a, 'b> {
    /// Renders a `table` as one bounded atom, gated by the `repeat`/
    /// `repeat_flow` cell scope: inside a scoped cell tables are
    /// unsupported (v1) and warn+skip (`table_in_cell`); everywhere else
    /// it renders.
    pub(in crate::engine) fn guarded_table_atom(
        &mut self,
        table: &TableItem,
        basis: &Basis,
    ) -> Option<Atom> {
        if self.scope.is_some() {
            self.diags.push(Diagnostic::new(Code::TableInCell));
            return None;
        }
        self.table_atom(table, basis)
    }

    /// Builds the bounded table atom: `box` resolves against `basis` for
    /// geometry (the grid border stays `style`), group/header/body rows
    /// stack at cumulative y, the per-side outer frame (map form) wraps
    /// the whole table, and the table `id:` becomes one `PlacedBox`.
    /// `None` when the empty-behavior gate says render nothing.
    fn table_atom(&mut self, table: &TableItem, basis: &Basis) -> Option<Atom> {
        let b = table.box_.clone().unwrap_or_default();
        let rb = self.resolve_box(&b, basis);
        let w = rb.w_or_fill(basis, 1.0);
        let region = Basis {
            x: rb.content_x(),
            w: rb.content_w(w),
            h: None,
            font: self.font_rel(),
        };
        let rows = self.table_rows(table)?;
        // Columns wider than the box overflow it silently (the parent's
        // `overflow` story) — like any container child, no `table_too_wide`
        // here (that warning is the flow region's, where width is fixed).
        let widths = self.column_widths(&table.columns, &region);
        let total_w: f64 = widths.iter().sum();
        let frame = TableFrame {
            widths: &widths,
            geom: self.row_geom(table, &region),
            grid: self.grid_border(table),
            x: region.x,
        };

        // The table's own style cascades into header + cells, like
        // `place_table`; restored after the atoms are built.
        let saved_style = self.inherited.clone();
        self.inherited = self.resolve_style(&table.style_names, &table.style);
        let group = self.header_group_atom(table, &frame);
        let header = self.table_header_atom(table, &frame);
        let row_atoms: Vec<Atom> = rows
            .iter()
            .enumerate()
            .map(|(i, row)| self.table_row_atom(table, &frame, row, i))
            .collect();
        self.inherited = saved_style;

        // Stack group + header + body rows at cumulative y (content top).
        let mut items = Vec::new();
        let mut boxes = Vec::new();
        let mut gy = 0.0;
        for atom in [group, header].into_iter().flatten().chain(row_atoms) {
            items.extend(translate(&atom.items, gy));
            boxes.extend(translate_boxes(&atom.boxes, gy));
            gy += atom.height;
        }
        if let Some(outer) = &frame.grid.outer {
            push_side_borders(&mut items, outer, (region.x, 0.0, total_w, gy), 1.0);
        }

        // Border-box height: a definite `box.h` reserves it (overflow is
        // the parent's story); auto height is the stacked grid plus
        // padding, clamped to the box min/max.
        let height = match rb.h {
            Some(h) => h,
            None => rb.clamp_h(gy + rb.v_padding()),
        };
        // Children carry y from the content-box top; lift by top padding.
        let out_items = translate(&items, rb.padding[0]);
        let mut out_boxes = translate_boxes(&boxes, rb.padding[0]);
        out_boxes.push(placed_box(
            &self.current_path(),
            table.id.as_deref(),
            &rb,
            w,
            height,
        ));
        Some(with_vertical_margin(
            Atom {
                height,
                items: out_items,
                boxes: out_boxes,
                rb: Some(rb),
            },
            rb.margin[0],
            rb.margin[2],
        ))
    }
}
