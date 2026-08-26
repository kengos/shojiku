//! Per-item scalar binding checks: `data:` keys, interpolation segments,
//! and their format variants. Array-scoped `repeat` cell bindings live in
//! [`cell`].

mod cell;
mod decl;
mod entry;
pub(super) use cell::{check_cell_bindings, CellScope};
pub(super) use decl::check_declarations;

use crate::catalog::Catalog;
use crate::definitions::FieldType;
use crate::interpolate::{parse_segments, Segment};
use crate::params::resolve_path;
use crate::template::{Bindings, Item, Link, NamedFormat};
use serde_json::Value;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};
use std::collections::BTreeMap;

/// The per-template invariants every scalar binding check reads. Bundled
/// so the per-binding call stays under clippy's argument threshold.
pub(super) struct BindingCtx<'a> {
    pub catalog: Option<&'a Catalog>,
    pub params: Option<&'a Value>,
    pub named: &'a BTreeMap<String, NamedFormat>,
}

/// Runs the scalar binding check over one string's `{key}` segments,
/// SKIPPING names the item declares under `bindings:` — a declared name
/// is checked once at its declaration ([`decl`]), where its real key and
/// scope are known, so re-checking it under the raw name would report
/// every finding twice. An interpolation segment carries no placeholder
/// of its own; only the field's own `placeholder` covers it.
fn walk_text<F: FnMut(&str, Option<&str>, Option<&str>, &str)>(
    content: Option<&str>,
    decls: &Bindings,
    path: &str,
    check: &mut F,
) {
    let Some(content) = content else { return };
    for segment in parse_segments(content) {
        if let Segment::Expr { key, format } = segment {
            if decls.contains_key(&key) {
                continue;
            }
            check(&key, format.as_deref(), None, path);
        }
    }
}

/// A `link.url` binds exactly like static text content.
fn url_of(link: Option<&Link>) -> Option<&str> {
    link.map(|link| link.url.as_str())
}

pub(super) fn check_scalar_binding(
    ctx: &BindingCtx,
    key: &str,
    format: Option<&str>,
    placeholder: Option<&str>,
    path: &str,
    diags: &mut Diagnostics,
) {
    let mut field_placeholder = None;
    if let Some(catalog) = ctx.catalog {
        match catalog.scalar(key) {
            None => {
                diags.push(
                    Diagnostic::new(Code::UnknownDataKey)
                        .arg("key", key)
                        .arg("source", "definitions")
                        .with_path(path.to_string()),
                );
                return;
            }
            Some(spec) => {
                field_placeholder = spec.placeholder.as_deref();
                if let Some(format) = format {
                    // A type name exempts the pick from the declared-set
                    // check because it is an OVERRIDE rather than a variant.
                    // On a DATE/DATETIME field that reason no longer holds —
                    // there a pack- or registry-declared name wins over the
                    // override (`format.dated.declared_first`). The exemption
                    // stays anyway, and deliberately: on a dated field the
                    // name may resolve to a PACK variant, and validate never
                    // sees a pack (`docs/agents/lang.md`), so it cannot tell
                    // a real pack variant from a typo. Narrowing it here
                    // would warn `unknown_format` on picks that render
                    // perfectly — the diagnostic is unchanged by this, in
                    // both directions, and was equally quiet before.
                    let is_type_override = FieldType::from_name(format).is_some();
                    let declared =
                        spec.formats.is_empty() || spec.formats.iter().any(|f| f == format);
                    // The template's own `formats:` registry and the
                    // builtin currency variants are always valid
                    // picks — declarations in definitions bound only the
                    // pack-variant namespace validate cannot see. On a
                    // number field, `symbol`/`name` coerce the value to
                    // currency at render, so they pass here too.
                    // `value` is the label escape on a labeled-enum
                    // field (renders the machine value), valid without
                    // being declared — like the currency variants.
                    let known_elsewhere = ctx.named.contains_key(format)
                        || (spec.field_type == FieldType::Currency
                            && matches!(format, "default" | "symbol" | "name"))
                        || (spec.field_type == FieldType::Number
                            && matches!(format, "symbol" | "name"))
                        || (!spec.enum_labels.is_empty() && format == "value");
                    if !is_type_override && !declared && !known_elsewhere {
                        diags.push(
                            Diagnostic::new(Code::UnknownFormat)
                                .arg("format", format)
                                .arg("key", key)
                                .with_path(path.to_string()),
                        );
                    }
                }
            }
        }
    }
    if let Some(params) = ctx.params {
        // A placeholder (the placement's, else the field's) is the author's
        // explicit "this field is intentionally blank" signal: it draws in
        // place of the absent value, so there is nothing to report.
        let covered = placeholder.or(field_placeholder).is_some();
        if resolve_path(params, key).is_none() && !covered {
            diags.push(
                Diagnostic::new(Code::MissingData)
                    .arg("scope", "")
                    .arg("key", key)
                    .with_path(path.to_string()),
            );
        }
    }
}

pub(super) fn walk_item<F: FnMut(&str, Option<&str>, Option<&str>, &str)>(
    item: &Item,
    path: &str,
    check: &mut F,
) {
    match item {
        Item::Text(text) => {
            if let Some(binding) = &text.data {
                check(
                    &binding.key,
                    binding.format.as_deref(),
                    binding.placeholder.as_deref(),
                    path,
                );
            }
            // A `{key:type}` override is not a declared variant; type
            // names are treated as always valid downstream.
            walk_text(text.text.as_deref(), &text.bindings, path, check);
            walk_text(url_of(text.link.as_ref()), &text.bindings, path, check);
            // Rich spans bind exactly like the item's own content,
            // through the OWNING item's declarations — a span has none.
            for (si, span) in text.spans.iter().enumerate() {
                let span_path = format!("{path}.spans[{si}]");
                if let Some(binding) = &span.data {
                    check(
                        &binding.key,
                        binding.format.as_deref(),
                        binding.placeholder.as_deref(),
                        &span_path,
                    );
                }
                walk_text(span.text.as_deref(), &text.bindings, &span_path, check);
                walk_text(
                    url_of(span.link.as_ref()),
                    &text.bindings,
                    &span_path,
                    check,
                );
            }
        }
        Item::Image(image) => {
            if let Some(binding) = &image.data {
                // Image bindings have no format variants; only the key
                // needs to exist. An image draws an asset, not text, so a
                // placeholder string has nothing to render — the key's
                // absence stays a `missing_data`.
                check(&binding.key, None, None, path);
            }
            walk_text(url_of(image.link.as_ref()), &image.bindings, path, check);
        }
        Item::Container(container) => {
            for (i, child) in container.items.iter().enumerate() {
                walk_item(child, &format!("{path}.items[{i}]"), check);
            }
        }
        Item::QrCode(qr) => {
            if let Some(binding) = &qr.data {
                check(
                    &binding.key,
                    binding.format.as_deref(),
                    binding.placeholder.as_deref(),
                    path,
                );
            }
            walk_text(qr.text.as_deref(), &qr.bindings, path, check);
        }
        Item::CharGrid(grid) => {
            // Binds like text/qr_code: a scalar key or `{key}` segments.
            // (Ruby markup is layout-time and orthogonal to binding.)
            if let Some(binding) = &grid.data {
                check(
                    &binding.key,
                    binding.format.as_deref(),
                    binding.placeholder.as_deref(),
                    path,
                );
            }
            walk_text(grid.text.as_deref(), &grid.bindings, path, check);
        }
        // Marks (ellipse/checkbox) bind via `MarkBinding`, validated in
        // `validate/marks.rs` (existence + boolean-type + conflict).
        Item::Rect(_)
        | Item::Line(_)
        | Item::PageNumber(_)
        | Item::PageBreak(_)
        | Item::Ellipse(_)
        | Item::Checkbox(_) => {}
        // Table, repeat, and list bindings are array-scoped, not scalar:
        // table/repeat/repeat_flow are validated separately in `validate`;
        // a list's array key is checked against params at layout
        // (`missing_data` / `not_an_array`), and its per-entry keys
        // against the element scope in [`entry`].
        Item::Table(_) | Item::Repeat(_) | Item::RepeatFlow(_) | Item::List(_) => {}
    }
}
