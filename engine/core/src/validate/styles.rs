//! `styleNames` cross-checks against the named-style registry, with the
//! MAX_STYLES / MAX_STYLE_NAMES sanity caps.

use crate::length::snippet;
use crate::style::{Style, MAX_STYLES, MAX_STYLE_NAMES};
use crate::template::{Body, Item, Template};
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
    if let Some(header) = &template.sections.header {
        walk_style_names(&header.items, "sections.header.items", known, diags);
    }
    let body_items: &[Item] = match &template.sections.body {
        Body::Flow(flow) => &flow.items,
        Body::Absolute(abs) => &abs.items,
    };
    walk_style_names(body_items, "sections.body.items", known, diags);
    if let Some(footer) = &template.sections.footer {
        walk_style_names(&footer.items, "sections.footer.items", known, diags);
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
            Item::Container(c) => {
                check_names(&c.style_names, &path, known, diags);
                walk_style_names(&c.items, &format!("{path}.items"), known, diags);
            }
            Item::Repeat(r) => {
                // The cell is a container: check its own styleNames, then walk
                // its children.
                check_names(&r.cell.style_names, &format!("{path}.cell"), known, diags);
                walk_style_names(&r.cell.items, &format!("{path}.cell.items"), known, diags);
            }
            Item::RepeatFlow(rf) => {
                // The card is a container, like a repeat cell.
                check_names(&rf.item.style_names, &format!("{path}.item"), known, diags);
                walk_style_names(&rf.item.items, &format!("{path}.item.items"), known, diags);
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
                for (ci, column) in t.columns.iter().enumerate() {
                    let col_path = format!("{path}.columns[{ci}]");
                    check_names(&column.style_names, &col_path, known, diags);
                    // A `cell:` column's sub-template is a container, like
                    // a repeat cell: its own styleNames, then its children.
                    if let Some(cell) = &column.cell {
                        check_names(&cell.style_names, &format!("{col_path}.cell"), known, diags);
                        walk_style_names(
                            &cell.items,
                            &format!("{col_path}.cell.items"),
                            known,
                            diags,
                        );
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
