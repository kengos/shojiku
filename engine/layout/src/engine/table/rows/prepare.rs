//! Preparing cells from columns: the header row's labels (interpolated
//! against top-level params, like any other static text) and one body
//! row's content, each resolved under the right style cascade before
//! `row_atom` measures and draws them.

use serde_json::Value;
use shojiku_core::{BindingScope, ColumnType, Style, TableItem};
use std::rc::Rc;

use super::super::super::{Atom, Ctx, Scope};
use super::super::{TableFrame, TABLE_HEADER_FILL};
use super::{Cell, CellContent, CellPath};

impl<'a, 'b> Ctx<'a, 'b> {
    /// The header row, if any column has a label. Header cells use the
    /// header's own style layers (over the table cascade) but take each
    /// column's authored alignment so labels line up with their cells;
    /// the fill defaults to the classic light gray unless the header
    /// style sets a `backgroundColor`.
    pub(in crate::engine::table) fn table_header_atom(
        &mut self,
        table: &TableItem,
        frame: &TableFrame,
    ) -> Option<Atom> {
        if table.columns.iter().all(|c| c.label.is_none()) {
            return None;
        }
        let default_style = Style::default();
        let (names, inline) = match &table.header {
            Some(h) => (
                &h.style_names[..],
                h.style.as_ref().unwrap_or(&default_style),
            ),
            None => (&[][..], &default_style),
        };
        let mut decor = self.resolve_style(names, inline);
        if decor.background_color.is_none() {
            decor.background_color = Some(TABLE_HEADER_FILL.to_string());
        }
        // Resolved up front, not inside the `map` below: interpolation
        // needs `&mut self` (it can warn) and the closure already borrows
        // self for the style cascade.
        let mut labels: Vec<String> = Vec::with_capacity(table.columns.len());
        for column in &table.columns {
            labels.push(self.header_label(column.label.as_deref()));
        }
        let cells: Vec<Cell> = table
            .columns
            .iter()
            .zip(frame.widths)
            .enumerate()
            .map(|(col, (column, &width))| {
                let mut computed = decor.clone();
                // The row band already draws the header decoration; cells
                // carry only text so the fill is not painted per cell.
                computed.background_color = None;
                computed.border_widths = [0.0; 4];
                computed.vertical_align =
                    self.label_valign((names, inline), (&column.style_names, &column.style));
                if let Some(align) = column.style.text_align {
                    computed.text_align = align;
                }
                Cell {
                    width,
                    // A `cell:` column's header is still a label: the
                    // sub-template is per-ROW content, not a header cell.
                    content: CellContent::Text(labels[col].clone()),
                    computed,
                    id: column.id.clone(),
                    path: CellPath::Column(col),
                }
            })
            .collect();
        Some(self.row_atom(frame, frame.geom.header_fixed, &cells, &decor))
    }

    /// One body row: zebra-aware row style, cells resolved under the
    /// row's cascade, bindings scoped to the row element.
    pub(in crate::engine::table) fn table_row_atom<'i>(
        &mut self,
        table: &'i TableItem,
        frame: &TableFrame,
        row: &Value,
        index: usize,
    ) -> Atom {
        let row_style = self.resolve_row_style(&table.row, index % 2 == 1, row);
        let saved_style = self.inherited.clone();
        self.inherited = row_style.clone();
        // Shared by every `cell:` column in this row: the scope is a cheap
        // pointer clone per cell, not a deep copy of the row — and a table
        // with no `cell:` columns skips the clone entirely.
        let element = table
            .columns
            .iter()
            .any(|c| c.cell.is_some())
            .then(|| Rc::new(row.clone()));
        let cells: Vec<Cell<'i>> = table
            .columns
            .iter()
            .zip(frame.widths)
            .enumerate()
            .map(|(col, (column, &width))| {
                // The column's binding resolves HERE, so its `missing_data`
                // / formatter diagnostics are raised inside the column they
                // belong to rather than on the whole table.
                let mark = self.enter_item(format!("columns[{col}]"));
                let content = self.cell_content(table, column, (row, index), element.as_ref());
                let mut computed = self.resolve_style(&column.style_names, &column.style);
                computed.vertical_align = self.cell_valign(&column.style_names, &column.style);
                self.leave_item(mark);
                Cell {
                    width,
                    content,
                    computed,
                    id: column.id.clone(),
                    path: CellPath::Column(col),
                }
            })
            .collect();
        self.inherited = saved_style;
        let cells = if table.merge_empty_cells() {
            super::super::span::merge_empty(cells)
        } else {
            cells
        };
        self.row_atom(frame, frame.geom.fixed, &cells, &row_style)
    }

    /// What one column contributes to a row: its `cell:` sub-template
    /// (scoped to the row element) or its bound value as text / a QR
    /// square / a per-element image asset. A column with neither is a
    /// validate error (`column_content_missing`); layout draws it empty
    /// rather than failing.
    fn cell_content<'i>(
        &mut self,
        table: &TableItem,
        column: &'i shojiku_core::Column,
        (row, index): (&Value, usize),
        element: Option<&Rc<Value>>,
    ) -> CellContent<'i> {
        // `cell` wins over `data` when a column authors both (the
        // conflict is a validate error; best-effort render shows the
        // richer content), mirroring `src` winning over `data` on images.
        // `element` is Some whenever any column has a `cell:`, so a cell
        // column always finds it.
        if let (Some(cell), Some(element)) = (&column.cell, element) {
            return CellContent::Cell {
                item: cell,
                scope: Scope {
                    element: Rc::clone(element),
                    array_key: table.data.key.clone(),
                    index,
                },
            };
        }
        let Some(binding) = &column.data else {
            return CellContent::Text(String::new());
        };
        // `scope: document` reads top-level params instead of the row —
        // the same escape a cell sub-template takes, so a column showing
        // one document-wide value needs no per-row data.
        let document = binding.scope() == BindingScope::Document;
        match column.column_type() {
            ColumnType::Image if document => CellContent::Image {
                asset_id: format!("dyn:{}", binding.key),
                fit: column.fit(),
            },
            ColumnType::Image => CellContent::Image {
                asset_id: shojiku_image::cell_asset_key(&table.data.key, index, &binding.key),
                fit: column.fit(),
            },
            kind => {
                let (row, array_key) = if document {
                    (None, None)
                } else {
                    (Some(row), Some(table.data.key.as_str()))
                };
                let text = self.resolve_binding(
                    &binding.key,
                    binding.format.as_deref(),
                    binding.placeholder.as_deref(),
                    row,
                    array_key,
                );
                match kind {
                    ColumnType::QrCode => CellContent::Qr(text),
                    _ => CellContent::Text(text),
                }
            }
        }
    }
}
