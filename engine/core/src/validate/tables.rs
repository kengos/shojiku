//! Table checks: the bound array group, per-column content shape
//! (`data` vs `cell` exclusivity), row-relative column keys, the
//! row `conditionalStyles` predicates, and the array-scoped bindings
//! inside a `cell:` column's sub-template.

use super::equals::{equals_fault, reads_as_boolean, resolve_target, EqualsFault};
use crate::catalog::Catalog;
use crate::template::{
    BindingScope, Column, ColumnType, RowSpec, Template, MAX_ROW_CONDITIONAL_STYLES,
};
use serde_json::Value;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics, Echo};

use super::bindings::{check_cell_bindings, check_scalar_binding, BindingCtx, CellScope};
use super::check_array_params;
use super::collect::collect_tables;

/// Tables need dedicated checks (array group + relative column keys).
pub(super) fn check_tables(
    template: &Template,
    catalog: Option<&Catalog>,
    params: Option<&Value>,
    diags: &mut Diagnostics,
) {
    let binding_ctx = BindingCtx {
        catalog,
        params,
        named: &template.formats,
    };
    for (path, table) in collect_tables(template) {
        let key = &table.data.key;
        if let Some(catalog) = catalog {
            if !catalog.contains(key) {
                diags.push(
                    Diagnostic::new(Code::UnknownDataKey)
                        .arg("key", key)
                        .arg("source", "definitions")
                        .with_path(path.clone()),
                );
            } else if !catalog.is_array(key) {
                diags.push(
                    Diagnostic::new(Code::NotAnArray)
                        .arg("key", key)
                        .with_path(path.clone()),
                );
            } else {
                check_column_bindings(&table.columns, key, catalog, &binding_ctx, &path, diags);
                check_row_conditions(&table.row, key, catalog, &path, diags);
            }
        }
        for (ci, column) in table.columns.iter().enumerate() {
            check_column_content(column, &format!("{path}.columns[{ci}]"), diags);
        }
        check_row_condition_cap(&table.row, &path, diags);
        check_array_params(params, key, "table", &path, diags);
    }
}

/// Every column's keys against the bound array group: a `data:` column's
/// own key, and — for a `cell:` column — every binding inside its
/// sub-template, which is row-scoped exactly like a `repeat` cell's.
fn check_column_bindings(
    columns: &[Column],
    key: &str,
    catalog: &Catalog,
    bindings: &BindingCtx<'_>,
    path: &str,
    diags: &mut Diagnostics,
) {
    for (ci, column) in columns.iter().enumerate() {
        let col_path = format!("{path}.columns[{ci}]");
        if let Some(cell) = &column.cell {
            let scope = CellScope {
                array_key: key,
                catalog,
                bindings,
            };
            check_cell_bindings(
                &cell.items,
                &scope,
                &format!("{col_path}.cell.items"),
                diags,
            );
            continue;
        }
        let Some(binding) = &column.data else {
            continue;
        };
        // A `scope: document` column reads top-level params, so it is
        // checked against the scalars — the same routing a cell's
        // bindings take.
        if binding.scope() == BindingScope::Document {
            check_scalar_binding(
                bindings,
                &binding.key,
                binding.format.as_deref(),
                binding.placeholder.as_deref(),
                &col_path,
                diags,
            );
            continue;
        }
        let field = binding.key.as_str();
        if catalog.array_field(key, field).is_none() {
            diags.push(
                Diagnostic::new(Code::UnknownDataKey)
                    .arg("key", field)
                    .arg("source", format!("array group `{}`", Echo::inline(key)))
                    .with_path(col_path),
            );
        }
    }
}

/// Every `row.conditionalStyles` predicate against the bound array group:
/// the `when.key` is row-relative (like a column's own binding). A
/// predicate that can never hold for ANY params is the finding — an
/// `equals`-less entry over a non-boolean field, or an `equals` literal
/// of the wrong kind or outside the field's declared `enum`.
fn check_row_conditions(
    row: &RowSpec,
    key: &str,
    catalog: &Catalog,
    path: &str,
    diags: &mut Diagnostics,
) {
    for (index, entry) in row
        .conditional_styles
        .iter()
        .take(MAX_ROW_CONDITIONAL_STYLES)
        .enumerate()
    {
        let entry_path = format!("{path}.row.conditionalStyles[{index}]");
        let field = &entry.when.key;
        let Some(target) = resolve_target(catalog, Some(key), field) else {
            diags.push(
                Diagnostic::new(Code::UnknownDataKey)
                    .arg("key", field)
                    .arg("source", format!("array group `{}`", Echo::inline(key)))
                    .with_path(entry_path),
            );
            continue;
        };
        // An `equals`-less entry reads the field as a boolean; with one,
        // the literal must be a value the field can actually carry. The
        // literal is never echoed — the key names the field.
        let code = match &entry.when.equals {
            None if !reads_as_boolean(&target) => Code::RowConditionNotBoolean,
            None => continue,
            Some(equals) => match equals_fault(&target, equals) {
                Some(EqualsFault::Kind) => Code::RowConditionTypeMismatch,
                Some(EqualsFault::NotDeclared) => Code::RowConditionEqualsNotDeclared,
                None => continue,
            },
        };
        diags.push(
            Diagnostic::new(code)
                .arg("key", field)
                .with_path(entry_path),
        );
    }
}

/// The `conditionalStyles` cap. Checked without a catalog too — it is a
/// property of the template alone.
fn check_row_condition_cap(row: &RowSpec, path: &str, diags: &mut Diagnostics) {
    let count = row.conditional_styles.len();
    if count > MAX_ROW_CONDITIONAL_STYLES {
        diags.push(
            Diagnostic::new(Code::TooManyRowConditions)
                .arg("count", count)
                .arg("max", MAX_ROW_CONDITIONAL_STYLES)
                .with_path(path.to_string()),
        );
    }
}

/// One column's content shape: exactly one of `data:` / `cell:`, and the
/// `data`-only knobs (`type`, `fit`) stay off a `cell:` column. Reported
/// here rather than at parse time because a column's own path is worth
/// more than a rejection at the `sections.body` enum boundary — and the
/// preview still renders (`cell` wins).
fn check_column_content(column: &Column, path: &str, diags: &mut Diagnostics) {
    if column.cell.is_some() {
        for (present, key) in [
            (column.data.is_some(), "data"),
            (column.column_type.is_some(), "type"),
            (column.fit.is_some(), "fit"),
        ] {
            if present {
                diags.push(
                    Diagnostic::new(Code::ColumnContentConflict)
                        .arg("key", key)
                        .with_path(path.to_string()),
                );
            }
        }
        return;
    }
    if column.data.is_none() {
        diags.push(Diagnostic::new(Code::ColumnContentMissing).with_path(path.to_string()));
        return;
    }
    // `fit` only acts on image columns; elsewhere it is a typo or a
    // leftover, so surface it.
    if column.fit.is_some() && column.column_type() != ColumnType::Image {
        diags.push(Diagnostic::new(Code::IgnoredColumnKey).with_path(path.to_string()));
    }
}
