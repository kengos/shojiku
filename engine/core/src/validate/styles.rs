//! `styleNames` cross-checks against the named-style registry, with the
//! MAX_STYLES / MAX_STYLE_NAMES sanity caps.

use crate::length::snippet;
use crate::style::{MAX_STYLE_NAMES, MAX_STYLES, Style};
use crate::template::{ChildHolder, ChildList, Item, Template};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};
use std::collections::BTreeMap;

/// Cross-checks `styleNames` references against the `styles` registry and
/// enforces the [`MAX_STYLES`] / [`MAX_STYLE_NAMES`] sanity caps. All
/// findings are warnings: an undefined or over-cap name simply does not
/// apply, so rendering still proceeds.
pub(super) fn check_style_names(template: &Template, diags: &mut Diagnostics) {
    let known = &template.styles;
    if known.len() > MAX_STYLES {
        diags.push(
            Diagnostic::new(Code::TooManyStyles)
                .arg("count", known.len())
                .arg("max", MAX_STYLES),
        );
    }
    for (prefix, items) in template.sections.item_lists() {
        walk_style_names(items, prefix, known, diags);
    }
}

fn walk_style_names(
    items: &[Item],
    prefix: &str,
    known: &BTreeMap<String, Style>,
    diags: &mut Diagnostics,
) {
    for (i, item) in items.iter().enumerate() {
        let path = format!("{prefix}[{i}]");
        match item {
            Item::Text(t) => {
                check_names(&t.style_names, &path, known, diags);
                for (si, span) in t.spans.iter().enumerate() {
                    check_names(
                        &span.style_names,
                        &format!("{path}.spans[{si}]"),
                        known,
                        diags,
                    );
                }
                if let Some(mark) = &t.mark {
                    check_names(&mark.style_names, &format!("{path}.mark"), known, diags);
                }
            }
            Item::PageNumber(p) => check_names(&p.style_names, &path, known, diags),
            Item::Container(_) | Item::Repeat(_) | Item::RepeatFlow(_) => {
                for list in item.child_lists() {
                    walk_box(&list, &path, known, diags);
                }
            }
            Item::Table(t) => {
                check_names(&t.style_names, &path, known, diags);
                check_names(&t.row.style_names, &format!("{path}.row"), known, diags);
                check_names(
                    &t.row.alternate_style_names,
                    &format!("{path}.row.alternate"),
                    known,
                    diags,
                );
                for (ei, entry) in t.row.conditional_styles.iter().enumerate() {
                    check_names(
                        &entry.style_names,
                        &format!("{path}.row.conditionalStyles[{ei}]"),
                        known,
                        diags,
                    );
                }
                if let Some(header) = &t.header {
                    check_names(&header.style_names, &format!("{path}.header"), known, diags);
                }
                // Each column's own styleNames come before its `cell:` box,
                // so the boxes are taken in step with the columns (a table
                // holds no other box).
                let mut cells = item.child_lists().into_iter().peekable();
                for (ci, column) in t.columns.iter().enumerate() {
                    check_names(
                        &column.style_names,
                        &format!("{path}.columns[{ci}]"),
                        known,
                        diags,
                    );
                    if let Some(cell) =
                        cells.next_if(|list| list.holder == ChildHolder::ColumnCell { column: ci })
                    {
                        walk_box(&cell, &path, known, diags);
                    }
                }
            }
            Item::Image(i) => check_names(&i.style_names, &path, known, diags),
            Item::QrCode(q) => check_names(&q.style_names, &path, known, diags),
            Item::List(l) => check_names(&l.style_names, &path, known, diags),
            Item::CharGrid(g) => check_names(&g.style_names, &path, known, diags),
            Item::Rect(r) => check_names(&r.style_names, &path, known, diags),
            Item::Ellipse(e) => check_names(&e.style_names, &path, known, diags),
            Item::Checkbox(c) => check_names(&c.style_names, &path, known, diags),
            // `line` keeps its own LineStyle (no styleNames); page breaks
            // carry no style at all.
            Item::Line(_) | Item::PageBreak(_) => {}
        }
    }
}

/// A box of nested items — a container, a `repeat` cell, a `repeat_flow`
/// card or a `cell:` column — is styled like a container: its own
/// styleNames, then its children.
fn walk_box(
    list: &ChildList<'_>,
    item_path: &str,
    known: &BTreeMap<String, Style>,
    diags: &mut Diagnostics,
) {
    check_names(
        &list.container.style_names,
        &list.box_path(item_path),
        known,
        diags,
    );
    walk_style_names(
        &list.container.items,
        &list.items_path(item_path),
        known,
        diags,
    );
}

fn check_names(
    names: &[String],
    path: &str,
    known: &BTreeMap<String, Style>,
    diags: &mut Diagnostics,
) {
    if names.len() > MAX_STYLE_NAMES {
        diags.push(
            Diagnostic::new(Code::TooManyStyleNames)
                .arg("count", names.len())
                .arg("max", MAX_STYLE_NAMES)
                .with_path(path.to_string()),
        );
    }
    // Only the names layout will actually apply are worth flagging.
    for name in names.iter().take(MAX_STYLE_NAMES) {
        if !known.contains_key(name) {
            diags.push(
                Diagnostic::new(Code::UndefinedStyleName)
                    .arg("name", snippet(name))
                    .with_path(path.to_string()),
            );
        }
    }
}
