//! Binding validation: do the template's data keys exist, are formats
//! valid, does the params tree actually contain the data?

use crate::catalog::Catalog;
use crate::definitions::Definitions;
use crate::params::resolve_path;
use crate::template::{Body, Item, Template};
use serde_json::Value;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};

mod bindings;
mod box_keys;
mod collect;
mod document;
mod equals;
mod formats;
mod presence;
mod ruby;
mod schema;
mod shapes;
mod spans;
mod styles;
mod tables;
#[cfg(test)]
mod tests;

use bindings::{
    check_cell_bindings, check_declarations, check_scalar_binding, walk_item, BindingCtx, CellScope,
};
use box_keys::{check_box_keys, check_table_pagination_keys};
use collect::{check_container_depth, collect_images, collect_repeats, walk_sections};
use document::check_document;
use formats::check_formats;
use presence::check_presence;
use ruby::check_ruby;
use shapes::check_shape_styles;
use spans::check_spans;
use styles::check_style_names;
use tables::check_tables;

/// Validates a template against optional definitions and optional params.
///
/// - With `definitions`: unknown binding keys are errors, undeclared format
///   variants are warnings.
/// - With `params`: keys that don't resolve produce `missing_data` warnings.
pub fn validate(
    definitions: Option<&Definitions>,
    template: &Template,
    params: Option<&Value>,
) -> Diagnostics {
    let catalog = definitions.map(Catalog::from_definitions);
    let mut diags = Diagnostics::new();

    // A definitions file with zero properties defines no keys, so every
    // binding below floods `unknown_data_key`. Surface the upstream cause
    // once — usually a mistyped top-level key left `properties` empty.
    if definitions.is_some_and(|d| d.properties.is_empty()) {
        diags.push(Diagnostic::new(Code::EmptyDefinitions));
    }
    if let Some(defs) = definitions {
        // Known semantic `format` values on a base type they don't apply
        // to are declared-schema mistakes; unknown values are hints.
        schema::check_definitions_quality(defs, &mut diags);
        // Params-vs-schema validation: required/type/range/enum/unknown.
        if let Some(params) = params {
            schema::check_params_schema(defs, params, &mut diags);
        }
    }

    let binding_ctx = BindingCtx {
        catalog: catalog.as_ref(),
        params,
        named: &template.formats,
    };
    let mut check_binding =
        |key: &str, format: Option<&str>, placeholder: Option<&str>, path: &str| {
            check_scalar_binding(&binding_ctx, key, format, placeholder, path, &mut diags);
        };

    if let Some(header) = &template.sections.header {
        for (i, item) in header.items.iter().enumerate() {
            let path = format!("sections.header.items[{i}]");
            walk_item(item, &path, &mut check_binding);
        }
    }
    let body_items: &[Item] = match &template.sections.body {
        Body::Flow(flow) => &flow.items,
        Body::Absolute(abs) => &abs.items,
    };
    for (i, item) in body_items.iter().enumerate() {
        let path = format!("sections.body.items[{i}]");
        walk_item(item, &path, &mut check_binding);
    }
    if let Some(footer) = &template.sections.footer {
        for (i, item) in footer.items.iter().enumerate() {
            let path = format!("sections.footer.items[{i}]");
            walk_item(item, &path, &mut check_binding);
        }
    }

    // `document:` metadata: the same key checks the drawn strings get,
    // plus the two list caps (the block is document-scoped, so it is
    // checked once rather than per section).
    check_document(template, &binding_ctx, &mut diags);

    // Named binding declarations (`bindings:`) and the charset scan over
    // interpolated strings. A separate walk because it reports on the
    // DECLARATION rather than on the reference, so it writes diagnostics
    // directly instead of going through the per-key check above.
    if let Some(header) = &template.sections.header {
        let prefix = "sections.header.items";
        check_declarations(&header.items, &binding_ctx, prefix, &mut diags);
    }
    check_declarations(body_items, &binding_ctx, "sections.body.items", &mut diags);
    if let Some(footer) = &template.sections.footer {
        let prefix = "sections.footer.items";
        check_declarations(&footer.items, &binding_ctx, prefix, &mut diags);
    }

    // Container nesting depth is a structural cap (layout enforces it
    // independently; validating catches it before render time).
    if let Some(header) = &template.sections.header {
        check_container_depth(&header.items, 1, "sections.header.items", &mut diags);
    }
    check_container_depth(body_items, 1, "sections.body.items", &mut diags);
    if let Some(footer) = &template.sections.footer {
        check_container_depth(&footer.items, 1, "sections.footer.items", &mut diags);
    }

    // Images need a structural check: exactly one of src/data.
    for (path, image) in collect_images(template) {
        match (&image.src, &image.data) {
            (Some(_), Some(_)) => {
                diags.push(Diagnostic::new(Code::ImageSourceConflict).with_path(path))
            }
            (None, None) => diags.push(Diagnostic::new(Code::ImageSourceMissing).with_path(path)),
            _ => {}
        }
    }

    check_tables(template, catalog.as_ref(), params, &mut diags);
    check_repeats(template, catalog.as_ref(), params, &mut diags);

    // Rich-text spans: content exclusivity, the span cap, and
    // span-inapplicable style keys.
    check_spans(template, &mut diags);

    // Ruby readings: empty entries and the entries cap.
    check_ruby(template, &mut diags);

    // Shape items: inert (text/box) keys on their inline styles.
    check_shape_styles(template, &mut diags);

    // Named-style references: every `styleName` must resolve to a registry
    // entry, and the registry / per-item lists stay bounded.
    check_style_names(template, &mut diags);

    // The `formats:` registry (reserved names, cap) and
    // `defaults.formats` shape checks.
    check_formats(template, &mut diags);

    // Box layout keys on leaf boxes (and grid keys without `type: grid`)
    // lay out nothing; surface the mistake.
    check_box_keys(template, &mut diags);

    // Pagination keys are inert on a non-flow (bounded) table.
    check_table_pagination_keys(template, &mut diags);

    // Form marks: the checked×data conflict, binding-key existence, and
    // the boolean-type hint for an `equals`-less binding.
    check_presence(template, catalog.as_ref(), params, &mut diags);

    // Collapse any `(code, path)` a walk emitted more than once.
    diags.dedup();
    diags
}

/// Repeats (n-up `repeat` and flow `repeat_flow`) need the same
/// array-group check as tables, plus array-scoped binding checks on their
/// cell/card contents (every `data:` / `{{key}}` resolves against the
/// bound element, like a table row).
fn check_repeats(
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
    for repeat in collect_repeats(template) {
        let (key, kind) = (repeat.key, repeat.kind);
        if let Some(catalog) = catalog {
            if !catalog.contains(key) {
                diags.push(
                    Diagnostic::new(Code::UnknownDataKey)
                        .arg("key", key)
                        .arg("source", "definitions")
                        .with_path(repeat.path.clone()),
                );
            } else if !catalog.is_array(key) {
                diags.push(
                    Diagnostic::new(Code::NotAnArray)
                        .arg("key", key)
                        .with_path(repeat.path.clone()),
                );
            } else {
                let cell = CellScope {
                    array_key: key,
                    catalog,
                    bindings: &binding_ctx,
                };
                check_cell_bindings(repeat.cell_items, &cell, &repeat.cell_path, diags);
            }
        }
        check_array_params(params, key, kind, &repeat.path, diags);
    }
}

/// Params-side array check shared by tables and repeats: the bound key
/// must exist (warning) and hold an array (error).
pub(in crate::validate) fn check_array_params(
    params: Option<&Value>,
    key: &str,
    kind: &str,
    path: &str,
    diags: &mut Diagnostics,
) {
    let Some(params) = params else { return };
    match resolve_path(params, key) {
        None => diags.push(
            Diagnostic::new(Code::MissingData)
                .arg("scope", format!("{kind} data "))
                .arg("key", key)
                .with_path(path.to_string()),
        ),
        Some(v) if !v.is_array() => diags.push(
            Diagnostic::new(Code::NotAnArray)
                .arg("key", key)
                .with_path(path.to_string()),
        ),
        Some(_) => {}
    }
}
