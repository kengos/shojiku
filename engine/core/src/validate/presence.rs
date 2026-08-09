//! Presence-binding validation, for both surfaces that carry one: a form
//! mark's `data:` and any item's `visible:`.
//!
//! What can be checked before params exist is the same for both — the key
//! must resolve (as a scalar, or scoped to a `repeat` element like a table
//! column), an `equals`-less binding must target a boolean field, and an
//! `equals` literal must be one the field can actually carry. Only the
//! DIAGNOSTIC CODES differ, because each message names what the fault
//! costs ("mark not drawn" vs "item not shown"), so the walk is shared and
//! the codes are a parameter.

use super::equals::{equals_fault, reads_as_boolean, resolve_target, EqualsFault, EqualsTarget};
use crate::catalog::Catalog;
use crate::params::resolve_path;
use crate::template::{
    BindingScope, Body, CheckboxItem, EllipseItem, EqualsValue, Item, MarkBinding, Template,
    TextItem,
};
use serde_json::Value;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics, Echo};

/// The three faults a presence binding can carry, in the reporting
/// surface's own vocabulary. Two sets exist: a form mark's and an item's
/// `visible:`; a third surface would add a third const, not a branch.
struct FaultCodes {
    not_boolean: Code,
    type_mismatch: Code,
    not_declared: Code,
}

/// A form mark's `data:` — "mark not drawn".
const MARK: FaultCodes = FaultCodes {
    not_boolean: Code::MarkBindingNotBoolean,
    type_mismatch: Code::MarkEqualsTypeMismatch,
    not_declared: Code::MarkEqualsNotDeclared,
};

/// An item's `visible:` — "item not shown".
const VISIBLE: FaultCodes = FaultCodes {
    not_boolean: Code::VisibleNotBoolean,
    type_mismatch: Code::VisibleTypeMismatch,
    not_declared: Code::VisibleEqualsNotDeclared,
};

pub(super) fn check_presence(
    template: &Template,
    catalog: Option<&Catalog>,
    params: Option<&Value>,
    diags: &mut Diagnostics,
) {
    let mut cx = PresenceCtx {
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

struct PresenceCtx<'a> {
    catalog: Option<&'a Catalog>,
    params: Option<&'a Value>,
    diags: &'a mut Diagnostics,
}

impl<'a> PresenceCtx<'a> {
    /// Walks items tracking the enclosing `repeat` array group (`None` at
    /// document scope), descending into containers and repeat cells.
    fn walk(&mut self, items: &[Item], array: Option<&str>, prefix: &str) {
        for (i, item) in items.iter().enumerate() {
            let path = format!("{prefix}[{i}]");
            // Every item may carry `visible:`, whatever its type — checked
            // before the type-specific arms, which cover only the marks.
            if let Some(v) = item.visible() {
                self.check_presence_binding(
                    &v.key,
                    v.equals.as_ref(),
                    v.scope(),
                    array,
                    &format!("{path}.visible"),
                    &VISIBLE,
                );
            }
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

    /// A form mark's binding, reported under the mark codes.
    fn check_binding(&mut self, binding: &MarkBinding, array: Option<&str>, path: &str) {
        self.check_presence_binding(
            &binding.key,
            binding.equals.as_ref(),
            binding.scope(),
            array,
            path,
            &MARK,
        );
    }

    /// Checks a presence binding's key exists (in the scalar catalog or
    /// the enclosing array group), that params carry it (scalar scope),
    /// that an `equals`-less binding targets a boolean field, and that an
    /// `equals` literal is one the field can actually carry.
    ///
    /// `codes` is the reporting surface's vocabulary — the checks are
    /// identical for a form mark and an item's `visible:`, only the
    /// consequence each message states differs.
    fn check_presence_binding(
        &mut self,
        key: &str,
        equals: Option<&EqualsValue>,
        scope: BindingScope,
        array: Option<&str>,
        path: &str,
        codes: &FaultCodes,
    ) {
        // `scope: document` reads TOP-LEVEL params even inside a `repeat`
        // cell — the escape a page-global flag needs, and the one layout has
        // always honoured. Resolving such a key against the enclosing array
        // group instead finds nothing and reports `unknown_data_key`, an
        // ERROR, over a perfectly correct template. Every other binding walk
        // folds the scope the same way (`bindings/cell.rs`,
        // `bindings/entry.rs`, `tables.rs`).
        let array = match scope {
            BindingScope::Document => None,
            BindingScope::Element => array,
        };
        let target = self.lookup(key, array, path);
        if array.is_none() {
            if let Some(params) = self.params {
                if resolve_path(params, key).is_none() {
                    self.diags.push(
                        Diagnostic::new(Code::MissingData)
                            .arg("scope", "")
                            .arg("key", key)
                            .with_path(path.to_string()),
                    );
                }
            }
        }
        let Some(target) = target else { return };
        let Some(equals) = equals else {
            if !reads_as_boolean(&target) {
                self.diags.push(
                    Diagnostic::new(codes.not_boolean)
                        .arg("key", key)
                        .with_path(path.to_string()),
                );
            }
            return;
        };
        // The literal is never echoed — the key names the field, exactly
        // as the params-side `enum` check does.
        let code = match equals_fault(&target, equals) {
            Some(EqualsFault::Kind) => codes.type_mismatch,
            Some(EqualsFault::NotDeclared) => codes.not_declared,
            None => return,
        };
        self.diags.push(
            Diagnostic::new(code)
                .arg("key", key)
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
