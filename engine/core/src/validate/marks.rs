//! Form-mark validation: the `checked`×`data` conflict, binding-key
//! existence (scalar, or scoped to a `repeat` element like a table
//! column), and a boolean-type hint for an `equals`-less binding — a
//! checkbox bound to a non-boolean field never toggles, so surface it.

use crate::catalog::Catalog;
use crate::definitions::FieldType;
use crate::params::resolve_path;
use crate::template::{Body, CheckboxItem, EllipseItem, Item, MarkBinding, Template, TextItem};
use serde_json::Value;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};

pub(super) fn check_marks(
    template: &Template,
    catalog: Option<&Catalog>,
    params: Option<&Value>,
    diags: &mut Diagnostics,
) {
    let mut cx = MarkCtx {
        catalog,
        params,
        diags,
    };
    if let Some(header) = &template.sections.header {
        cx.walk(&header.items, None, "sections.header.items");
    }
    let body: &[Item] = match &template.sections.body {
        Body::Flow(flow) => &flow.items,
        Body::Absolute(abs) => &abs.items,
    };
    cx.walk(body, None, "sections.body.items");
    if let Some(footer) = &template.sections.footer {
        cx.walk(&footer.items, None, "sections.footer.items");
    }
}

struct MarkCtx<'a> {
    catalog: Option<&'a Catalog>,
    params: Option<&'a Value>,
    diags: &'a mut Diagnostics,
}

impl MarkCtx<'_> {
    /// Walks items tracking the enclosing `repeat` array group (`None` at
    /// document scope), descending into containers and repeat cells.
    fn walk(&mut self, items: &[Item], array: Option<&str>, prefix: &str) {
        for (i, item) in items.iter().enumerate() {
            let path = format!("{prefix}[{i}]");
            match item {
                Item::Ellipse(EllipseItem {
                    data: Some(binding),
                    ..
                }) => self.check_binding(binding, array, &path),
                Item::Checkbox(checkbox) => self.check_checkbox(checkbox, array, &path),
                Item::Text(TextItem {
                    mark: Some(mark), ..
                }) => {
                    if let Some(binding) = &mark.data {
                        self.check_binding(binding, array, &format!("{path}.mark"));
                    }
                }
                Item::Container(c) => self.walk(&c.items, array, &format!("{path}.items")),
                Item::Repeat(r) => {
                    self.walk(
                        &r.cell.items,
                        Some(&r.data.key),
                        &format!("{path}.cell.items"),
                    );
                }
                Item::RepeatFlow(rf) => {
                    self.walk(
                        &rf.item.items,
                        Some(&rf.data.key),
                        &format!("{path}.item.items"),
                    );
                }
                // A `cell:` column's marks are scoped to the table's row
                // element, exactly like a repeat cell's.
                Item::Table(table) => {
                    for (ci, column) in table.columns.iter().enumerate() {
                        if let Some(cell) = &column.cell {
                            self.walk(
                                &cell.items,
                                Some(&table.data.key),
                                &format!("{path}.columns[{ci}].cell.items"),
                            );
                        }
                    }
                }
                _ => {}
            }
        }
    }

    fn check_checkbox(&mut self, checkbox: &CheckboxItem, array: Option<&str>, path: &str) {
        if checkbox.checked.is_some() && checkbox.data.is_some() {
            self.diags
                .push(Diagnostic::new(Code::MarkContentConflict).with_path(path.to_string()));
        }
        if let Some(binding) = &checkbox.data {
            self.check_binding(binding, array, path);
        }
    }

    /// Checks a mark binding's key exists (in the scalar catalog or the
    /// enclosing array group), that params carry it (scalar scope), and
    /// that an `equals`-less binding targets a boolean field.
    fn check_binding(&mut self, binding: &MarkBinding, array: Option<&str>, path: &str) {
        let field_type = self.lookup(&binding.key, array, path);
        if array.is_none() {
            if let Some(params) = self.params {
                if resolve_path(params, &binding.key).is_none() {
                    self.diags.push(
                        Diagnostic::new(Code::MissingData)
                            .arg("scope", "")
                            .arg("key", &binding.key)
                            .with_path(path.to_string()),
                    );
                }
            }
        }
        if binding.equals.is_none() {
            if let Some(ft) = field_type {
                if ft != Some(FieldType::Boolean) {
                    self.diags.push(
                        Diagnostic::new(Code::MarkBindingNotBoolean)
                            .arg("key", &binding.key)
                            .with_path(path.to_string()),
                    );
                }
            }
        }
    }

    /// Resolves the field's declared type, emitting `unknown_data_key`
    /// when definitions are present but the key is absent. Outer `None` =
    /// no catalog or unknown key (error pushed); `Some(None)` = the key is
    /// a declared ARRAY source (the multi-select `equals` array-contains
    /// form — known, but carrying no scalar type, so an `equals`-less mark
    /// still warns it is not boolean).
    fn lookup(&mut self, key: &str, array: Option<&str>, path: &str) -> Option<Option<FieldType>> {
        let catalog = self.catalog?;
        let spec = match array {
            Some(group) => catalog.array_field(group, key),
            None => catalog.scalar(key),
        };
        let known_array = match array {
            Some(group) => catalog.row_array(group, key),
            None => catalog.is_array(key),
        };
        match spec {
            Some(spec) => Some(Some(spec.field_type)),
            None if known_array => Some(None),
            None => {
                let source = match array {
                    Some(group) => format!("array group `{group}`"),
                    None => "definitions".to_string(),
                };
                self.diags.push(
                    Diagnostic::new(Code::UnknownDataKey)
                        .arg("key", key)
                        .arg("source", source)
                        .with_path(path.to_string()),
                );
                None
            }
        }
    }
}
