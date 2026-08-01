//! Template + params walk: load every referenced image into an
//! [`AssetStore`], enforcing the [`AssetPolicy`].
//!
//! Severity rules: template-owned (`src`) failures and every
//! policy/security violation (traversal, denied dynamic content, remote
//! URLs) are **errors**; params-owned content problems (bad base64,
//! undecodable bytes, caps) degrade to **warnings** and the item is
//! skipped, matching how `missing_data` behaves for text.

use crate::policy::AssetPolicy;
use crate::store::{Asset, AssetKind, AssetStore};
use serde_json::Value;
use shojiku_core::{Binding, BindingScope, Body, ImageItem, Item, Template};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};
use std::collections::BTreeMap;
use std::path::Path;

use bundled::AssetsRoot;
use cells::CellCtx;

/// Cap on per-element cell images loaded for one template. Table rows ×
/// image columns and repeat elements × image items are params-controlled;
/// this one cap bounds the whole load fan-out across both.
pub const MAX_CELL_IMAGE_ASSETS: usize = 1000;

/// Store key for one per-element cell image (a `type: image` table column
/// or an `image` item inside a repeat/repeat_flow cell): shared with layout
/// so both sides compute the same id.
pub fn cell_asset_key(array_key: &str, index: usize, rel_key: &str) -> String {
    format!("dyn:{array_key}[{index}].{rel_key}")
}

/// The effective source of an image item (`src` wins over `data`; the
/// conflicting-both case is a validate.rs error, and a best-effort render
/// should still show the static image).
enum ResolvedSource<'a> {
    Static(&'a str),
    Dynamic(&'a Binding),
}

fn source_of(item: &ImageItem) -> Option<ResolvedSource<'_>> {
    match (&item.src, &item.data) {
        (Some(src), _) => Some(ResolvedSource::Static(src)),
        (None, Some(binding)) => Some(ResolvedSource::Dynamic(binding)),
        (None, None) => None,
    }
}

fn key_of(source: &ResolvedSource<'_>) -> String {
    match source {
        ResolvedSource::Static(src) => format!("src:{src}"),
        ResolvedSource::Dynamic(binding) => format!("dyn:{}", binding.key),
    }
}

/// Store key for an image item's asset, shared with layout so both sides
/// compute the same id (`src:<src>` / `dyn:<params key>`).
pub fn asset_key(item: &ImageItem) -> Option<String> {
    source_of(item).map(|source| key_of(&source))
}

/// Loads every image the template references, resolving bundled paths
/// against a filesystem directory (the CLI / MCP hosts).
///
/// `assets_root` is the directory bundled assets resolve against (typically
/// the template's own directory); `None` disables bundled sources entirely.
pub fn prepare_assets(
    template: &Template,
    params: &Value,
    policy: &AssetPolicy,
    assets_root: Option<&Path>,
) -> (AssetStore, Diagnostics) {
    let root = assets_root.map_or(AssetsRoot::None, AssetsRoot::Dir);
    prepare_with(template, params, policy, root)
}

/// Loads every image the template references, resolving bundled paths against
/// host-injected bytes (the WASM host — no filesystem). `injected` is keyed by
/// the same relative path the template references (`.` segments dropped,
/// `/`-joined); the confinement and caps match the filesystem path exactly.
pub fn prepare_assets_injected(
    template: &Template,
    params: &Value,
    policy: &AssetPolicy,
    injected: &BTreeMap<String, Vec<u8>>,
) -> (AssetStore, Diagnostics) {
    prepare_with(template, params, policy, AssetsRoot::Injected(injected))
}

/// The shared walk over both roots: the FS and injected entry points differ
/// only in the [`AssetsRoot`] they thread through.
fn prepare_with(
    template: &Template,
    params: &Value,
    policy: &AssetPolicy,
    assets_root: AssetsRoot<'_>,
) -> (AssetStore, Diagnostics) {
    let mut store = AssetStore::empty();
    let mut diags = Diagnostics::new();
    for (path, item) in image_items(template) {
        // Sourceless items are a validate.rs error (image_source_missing).
        let Some(source) = source_of(item) else { continue };
        let key = key_of(&source);
        if store.contains(&key) {
            continue;
        }
        let kind = match source {
            ResolvedSource::Static(src) => {
                static_asset(src, policy, assets_root, &path, &mut diags)
            }
            ResolvedSource::Dynamic(binding) => dynamic_asset(
                item.id.as_deref(),
                &binding.key,
                params,
                policy,
                assets_root,
                &path,
                &mut diags,
            ),
        };
        let Some(kind) = kind else { continue };
        insert_asset(&mut store, &mut diags, key, kind, &path);
    }
    cells::prepare_cell_assets(
        template,
        params,
        &CellCtx {
            policy,
            assets_root,
        },
        &mut store,
        &mut diags,
    );
    (store, diags)
}

/// Records an asset, surfacing any SVG parse warnings under its path.
pub(super) fn insert_asset(
    store: &mut AssetStore,
    diags: &mut Diagnostics,
    key: String,
    kind: AssetKind,
    path: &str,
) {
    if let AssetKind::Svg(tree) = &kind {
        for warning in &tree.warnings {
            diags.push(
                Diagnostic::new(Code::SvgUnsupported)
                    .arg("detail", warning.to_string())
                    .with_path(path.to_string()),
            );
        }
    }
    store.insert(Asset { id: key, kind });
}

/// Collects the image items loaded through the shared (non-scoped) path:
/// every top-level image, plus the images inside a per-element cell whose
/// source is SHARED across the elements — a static `src:`, or a `data:`
/// binding at `scope: document`. A cell's element-scoped `data:` image is
/// loaded once per element by the cell walk instead.
fn image_items(template: &Template) -> Vec<(String, &ImageItem)> {
    let mut out = Vec::new();
    if let Some(header) = &template.sections.header {
        push_images(&header.items, "sections.header.items", false, &mut out);
    }
    let body_items: &[Item] = match &template.sections.body {
        Body::Flow(flow) => &flow.items,
        Body::Absolute(abs) => &abs.items,
    };
    push_images(body_items, "sections.body.items", false, &mut out);
    if let Some(footer) = &template.sections.footer {
        push_images(&footer.items, "sections.footer.items", false, &mut out);
    }
    out
}

/// `in_cell` is set once the walk descends into a per-element cell (a
/// `repeat`/`repeat_flow` cell or a table column's `cell:`): there only a
/// static `src:` image and a `scope: document` binding are collected
/// (shared, loaded once); an element-scoped `data:` cell image is loaded
/// per element by the cell walk instead.
fn push_images<'a>(
    items: &'a [Item],
    prefix: &str,
    in_cell: bool,
    out: &mut Vec<(String, &'a ImageItem)>,
) {
    for (index, item) in items.iter().enumerate() {
        let path = format!("{prefix}[{index}]");
        match item {
            Item::Image(image) if !in_cell || !is_element_scoped(image) => out.push((path, image)),
            Item::Container(container) => {
                push_images(&container.items, &format!("{path}.items"), in_cell, out);
            }
            Item::Repeat(repeat) => {
                push_images(&repeat.cell.items, &format!("{path}.cell.items"), true, out);
            }
            Item::RepeatFlow(rf) => {
                push_images(&rf.item.items, &format!("{path}.item.items"), true, out);
            }
            // A table column's `cell:` is a per-element cell too — its
            // shared images (`src:`, `scope: document`) load here, its
            // element-scoped ones through the cell walk.
            Item::Table(table) => {
                for (ci, column) in table.columns.iter().enumerate() {
                    if let Some(cell) = &column.cell {
                        let prefix = format!("{path}.columns[{ci}].cell.items");
                        push_images(&cell.items, &prefix, true, out);
                    }
                }
            }
            _ => {}
        }
    }
}

/// Whether an image's source is bound PER ELEMENT inside a cell — a
/// `data:` binding at the default `scope: element`, with no static `src:`
/// to win over it. The shared and per-element walks split on exactly this
/// predicate, so they can never both claim (or both skip) an item.
pub(super) fn is_element_scoped(image: &ImageItem) -> bool {
    image.src.is_none()
        && image
            .data
            .as_ref()
            .is_some_and(|binding| binding.scope() == BindingScope::Element)
}

/// Whether a load failure came from template content (error) or params
/// content (warning + skip).
#[derive(Clone, Copy)]
enum Origin {
    Static,
    Dynamic,
}

impl Origin {
    fn content_problem(self, message: String, path: &str) -> Diagnostic {
        let code = match self {
            Origin::Static => Code::InvalidImageAsset,
            Origin::Dynamic => Code::InvalidImageData,
        };
        Diagnostic::new(code)
            .arg("detail", message)
            .with_path(path.to_string())
    }
}

mod bundled;
mod cells;
mod load;
#[cfg(test)]
mod tests;

use load::{dynamic_asset, static_asset};
