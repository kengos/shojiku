//! Form-mark validation: the `checked`×`data` conflict, binding-key
//! existence (scalar, or scoped to a `repeat` element like a table
//! column), and a boolean-type hint for an `equals`-less binding — a
//! checkbox bound to a non-boolean field never toggles, so surface it.

use super::equals::{equals_fault, reads_as_boolean, resolve_target, EqualsFault, EqualsTarget};
use crate::catalog::Catalog;
use crate::params::resolve_path;
use crate::template::{Body, CheckboxItem, EllipseItem, Item, MarkBinding, Template, TextItem};
use serde_json::Value;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics, Echo};

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

impl<'a> MarkCtx<'a> {
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
    /// enclosing array group), that params carry it (scalar scope), that
    /// an `equals`-less binding targets a boolean field, and that an
    /// `equals` literal is one the field can actually carry.
    fn check_binding(&mut self, binding: &MarkBinding, array: Option<&str>, path: &str) {
        let target = self.lookup(&binding.key, array, path);
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
        let Some(target) = target else { return };
        let Some(equals) = &binding.equals else {
            if !reads_as_boolean(&target) {
                self.diags.push(
                    Diagnostic::new(Code::MarkBindingNotBoolean)
                        .arg("key", &binding.key)
                        .with_path(path.to_string()),
                );
            }
            return;
        };
        // The literal is never echoed — the key names the field, exactly
        // as the params-side `enum` check does.
        let code = match equals_fault(&target, equals) {
            Some(EqualsFault::Kind) => Code::MarkEqualsTypeMismatch,
            Some(EqualsFault::NotDeclared) => Code::MarkEqualsNotDeclared,
            None => return,
        };
        self.diags.push(
            Diagnostic::new(code)
                .arg("key", &binding.key)
                .with_path(path.to_string()),
        );
    }

    /// Resolves what the field declares, emitting `unknown_data_key` when
    /// definitions are present but the key is absent. `None` = no catalog
    /// or unknown key (the error is pushed here); an ARRAY source is the
    /// multi-select form and carries its ELEMENT spec when the schema
    /// declares a scalar one.
    fn lookup(&mut self, key: &str, array: Option<&str>, path: &str) -> Option<EqualsTarget<'a>> {
        let catalog = self.catalog?;
        if let Some(target) = resolve_target(catalog, array, key) {
            return Some(target);
        }
        // The group name is document-declared, so it is bounded where it
        // is composed into the arg (the same rule the cell walk follows).
        let source = match array {
            Some(group) => format!("array group `{}`", Echo::inline(group)),
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
