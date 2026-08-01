//! Scoped per-element cell asset preparation: `type: image` table
//! columns and `image` items inside a per-element cell — a
//! `repeat`/`repeat_flow` cell or a table column's `cell:` — each load
//! one asset per bound array element (`dyn:<array>[<i>].<key>`), all
//! sharing one load-fanout cap. Static `src:` cell images load once
//! (shared).

use crate::policy::AssetPolicy;
use crate::store::AssetStore;
use serde_json::Value;
use shojiku_core::{resolve_path, BindingScope, ColumnType, TableItem, Template};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};

mod walk;

use super::bundled::AssetsRoot;
use super::load::dynamic_value;
use super::{cell_asset_key, insert_asset, MAX_CELL_IMAGE_ASSETS};
use walk::{body_tables, element_cell_images};

/// The bindings a per-element cell walk shares: the policy, the assets
/// root, and the growing store/diagnostics — bundled so the two cell
/// walks (table columns, repeat cells) keep signatures under the limit.
pub(super) struct CellCtx<'a> {
    pub policy: &'a AssetPolicy,
    pub assets_root: AssetsRoot<'a>,
}

/// The shared load-fanout cap: rows × image columns (and repeat elements ×
/// image items) are params-controlled, so one counter bounds every
/// per-element asset load across tables AND repeat cells. Reaching the cap
/// warns and stops the whole walk, so the warning fires exactly once.
#[derive(Default)]
struct Cap {
    loaded: usize,
}

impl Cap {
    /// Whether the cap is reached; warns and stops the caller when it is.
    /// Only successful loads count, so skips don't consume it.
    fn full(&mut self, path: &str, diags: &mut Diagnostics) -> bool {
        if self.loaded >= MAX_CELL_IMAGE_ASSETS {
            diags.push(
                Diagnostic::new(Code::CellImageAssetsCapped)
                    .arg("max", MAX_CELL_IMAGE_ASSETS)
                    .with_path(path.to_string()),
            );
            return true;
        }
        false
    }

    fn record(&mut self) {
        self.loaded += 1;
    }
}

/// Prepares every per-element cell image — `type: image` table columns and
/// `image` items inside repeat/repeat_flow cells — under one shared cap.
pub(super) fn prepare_cell_assets(
    template: &Template,
    params: &Value,
    ctx: &CellCtx<'_>,
    store: &mut AssetStore,
    diags: &mut Diagnostics,
) {
    let mut cap = Cap::default();
    for (path, table) in body_tables(template) {
        if table_column_assets(table, &path, params, ctx, store, diags, &mut cap) {
            return;
        }
    }
    for cell in element_cell_images(template) {
        if load_cell_image(&cell, params, ctx, store, diags, &mut cap) {
            return;
        }
    }
}

/// Loads each row's per-element asset for every `type: image` column of one
/// table. Returns `true` once the shared cap is hit (caller stops).
fn table_column_assets(
    table: &TableItem,
    path: &str,
    params: &Value,
    ctx: &CellCtx<'_>,
    store: &mut AssetStore,
    diags: &mut Diagnostics,
    cap: &mut Cap,
) -> bool {
    for column in &table.columns {
        if column.column_type() != ColumnType::Image {
            continue;
        }
        let Some(binding) = &column.data else {
            continue;
        };
        let ident = column.id.as_deref();
        if ctx.policy.is_denied(ident) {
            diags.push(
                Diagnostic::new(Code::DynamicImageDenied)
                    .arg("scope", " for this column")
                    .with_path(path.to_string()),
            );
            continue;
        }
        // A `scope: document` column shows ONE image in every row, so it
        // loads once off top-level params under the shared `dyn:<key>`
        // id — matching what layout asks for — and never consumes the
        // per-element cap.
        if binding.scope() == BindingScope::Document {
            let key = format!("dyn:{}", binding.key);
            let value = resolve_path(params, &binding.key).and_then(Value::as_str);
            load_element(&key, ident, value, ctx, store, diags, path);
            continue;
        }
        // A missing/non-array source is the table walk's diagnostic.
        let Some(Value::Array(rows)) = resolve_path(params, &table.data.key) else {
            continue;
        };
        for (index, row) in rows.iter().enumerate() {
            if cap.full(path, diags) {
                return true;
            }
            let key = cell_asset_key(&table.data.key, index, &binding.key);
            // A missing/non-string element degrades like missing text
            // (the cell renders empty; layout warns missing_asset).
            let value = resolve_path(row, &binding.key).and_then(Value::as_str);
            if load_element(&key, ident, value, ctx, store, diags, path) {
                cap.record();
            }
        }
    }
    false
}

/// A `data:`-bound `image` item found inside a repeat/repeat_flow cell,
/// with the bound array key it is element-scoped to and its diagnostics
/// path. (Static `src:` cell images load once through the shared walk.)
pub(super) struct CellImage<'a> {
    pub(super) array_key: &'a str,
    pub(super) binding_key: &'a str,
    pub(super) ident: Option<&'a str>,
    pub(super) path: String,
}

/// Loads one repeat/repeat_flow cell image: its `data:` binding loads one
/// asset per bound element (`dyn:<array>[<i>].<key>`) under the shared cap.
/// Returns `true` once the cap is hit.
fn load_cell_image(
    cell: &CellImage<'_>,
    params: &Value,
    ctx: &CellCtx<'_>,
    store: &mut AssetStore,
    diags: &mut Diagnostics,
    cap: &mut Cap,
) -> bool {
    let path = cell.path.as_str();
    if ctx.policy.is_denied(cell.ident) {
        diags.push(
            Diagnostic::new(Code::DynamicImageDenied)
                .arg("scope", " for this image")
                .with_path(path.to_string()),
        );
        return false;
    }
    let Some(Value::Array(elems)) = resolve_path(params, cell.array_key) else {
        return false;
    };
    for (index, elem) in elems.iter().enumerate() {
        if cap.full(path, diags) {
            return true;
        }
        let key = cell_asset_key(cell.array_key, index, cell.binding_key);
        let value = resolve_path(elem, cell.binding_key).and_then(Value::as_str);
        if load_element(&key, cell.ident, value, ctx, store, diags, path) {
            cap.record();
        }
    }
    false
}

/// Loads one already-keyed element asset. Returns `true` on a successful
/// insert (so the caller counts it against the cap); a duplicate key,
/// missing/non-string value, or load failure loads nothing and returns
/// `false` (uncounted, matching the pre-cap semantics).
fn load_element(
    key: &str,
    ident: Option<&str>,
    value: Option<&str>,
    ctx: &CellCtx<'_>,
    store: &mut AssetStore,
    diags: &mut Diagnostics,
    path: &str,
) -> bool {
    if store.contains(key) {
        return false;
    }
    let Some(raw) = value else {
        return false;
    };
    let Some(kind) = dynamic_value(ident, raw, ctx.policy, ctx.assets_root, path, diags) else {
        return false;
    };
    insert_asset(store, diags, key.to_string(), kind, path);
    true
}
