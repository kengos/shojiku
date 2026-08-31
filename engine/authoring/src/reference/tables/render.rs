//! Rendering a spec into GFM table markdown.
//!
//! One invariant runs through the whole file: **every row emits exactly one
//! cell per column**. It is not asserted at the end — it is the shape of the
//! code, because the row loop walks the COLUMN list. That is the difference
//! between this and the hand-written tables it replaces, nine of whose rows
//! carried a cell the renderer silently dropped.

use super::spec::{Cell, Column, Row, Table};
use std::collections::BTreeMap;

/// Every diagnostic code the engine can emit, paired with its default
/// severity — `DiagnosticCode::ALL` flattened by the caller, so this module
/// stays a pure function over its inputs.
pub type Registry = BTreeMap<String, String>;

/// A cell the spec asked for and nothing could supply.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Missing {
    pub id: String,
    pub key: String,
    pub column: String,
}

/// GFM reads an unescaped `|` as a cell boundary, so any pipe inside a cell's
/// text has to be escaped — the enum alternations these tables are full of
/// (`` `contain` \| `cover` ``) are exactly that case.
fn escape(text: &str) -> String {
    text.replace('|', r"\|").replace('\n', " ")
}

/// The `Key` cell: the page's own label when it has one, else the row's keys
/// backticked and joined the way the doc set already writes a grouped row.
fn key_cell(row: &Row) -> String {
    row.label.clone().unwrap_or_else(|| {
        row.keys
            .iter()
            .map(|k| format!("`{k}`"))
            .collect::<Vec<_>>()
            .join(" / ")
    })
}

/// The text for one cell, or `None` when no source has it.
///
/// A row's own text always wins. On an `authored` column it is the only
/// source; on a derived one it is an override, and [`super::audit`] refuses an
/// override with no stated reason so it cannot become the normal case.
fn cell_text(row: &Row, column: &Column, registry: &Registry) -> Option<String> {
    if let Some(text) = row.cells.get(&column.header) {
        return Some(text.clone());
    }
    match column.from {
        Cell::Key => Some(key_cell(row)),
        // A grouped diagnostics row takes the FIRST code's severity, which is
        // why such a row may only group codes that share one — the audit has
        // no way to know, so the rendered value is what a reader checks.
        Cell::Severity => registry.get(row.keys.first()?).cloned(),
        Cell::Authored => None,
    }
}

/// Renders one table's markdown body — header, separator, one line per row.
///
/// # Errors
///
/// Returns every cell the spec asked for that no source could supply, rather
/// than the first: a page that has just grown a column wants the whole list.
pub fn render(id: &str, table: &Table, registry: &Registry) -> Result<String, Vec<Missing>> {
    let mut missing = Vec::new();
    let mut lines = Vec::with_capacity(table.rows.len() + 2);
    lines.push(row_line(table.columns.iter().map(|c| escape(&c.header))));
    lines.push(row_line(table.columns.iter().map(|_| "---".to_owned())));
    for row in &table.rows {
        let mut cells = Vec::with_capacity(table.columns.len());
        for column in &table.columns {
            match cell_text(row, column, registry) {
                Some(text) => cells.push(escape(&text)),
                None => {
                    missing.push(Missing {
                        id: id.to_owned(),
                        key: row.keys.first().cloned().unwrap_or_default(),
                        column: column.header.clone(),
                    });
                    cells.push(String::new());
                }
            }
        }
        lines.push(row_line(cells.into_iter()));
    }
    if missing.is_empty() {
        Ok(lines.join("\n"))
    } else {
        Err(missing)
    }
}

/// One `| a | b |` line. The only place a row's cells become text, so the
/// column count cannot differ between the header and a body row.
///
/// An EMPTY cell is one space between two bars, not two — which is how the
/// doc set already writes it (`| \u{60}src\u{60} | string | | Bundled path,` on
/// `image.md`), and reproducing it is what lets the byte-comparison gate
/// exist at all.
fn row_line(cells: impl Iterator<Item = String>) -> String {
    let mut out = String::from("|");
    for cell in cells {
        if cell.is_empty() {
            out.push_str(" |");
        } else {
            out.push(' ');
            out.push_str(&cell);
            out.push_str(" |");
        }
    }
    out
}
