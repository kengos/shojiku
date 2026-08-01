//! Shape-style checks: inert style keys on the inline style of `rect`/
//! `ellipse`/`checkbox`/text `mark` items (`shape_style_ignored`) —
//! shapes honor only the box-decoration subset of [`Style`].

use crate::style::Style;
use crate::template::{Item, Template};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};

use super::walk_sections;

/// Flags text/box keys that have no effect on a shape item's inline
/// style. Warnings only: layout ignores the keys deterministically, so
/// rendering still proceeds. Like the span check, named styles are not
/// flagged — a shared style bag may carry keys for its other users.
pub(super) fn check_shape_styles(template: &Template, diags: &mut Diagnostics) {
    walk_sections(template, &mut |item, path| match item {
        Item::Rect(r) => flag_inert(&r.style, "rect", path, diags),
        Item::Ellipse(e) => flag_inert(&e.style, "ellipse", path, diags),
        Item::Checkbox(c) => flag_inert(&c.style, "checkbox", path, diags),
        Item::Text(t) => {
            if let Some(mark) = &t.mark {
                flag_inert(&mark.style, "mark", &format!("{path}.mark"), diags);
            }
        }
        _ => {}
    });
}

fn flag_inert(style: &Style, item: &str, path: &str, diags: &mut Diagnostics) {
    let ignored = style.ignored_shape_keys();
    if !ignored.is_empty() {
        diags.push(
            Diagnostic::new(Code::ShapeStyleIgnored)
                .arg("item", item)
                .arg("keys", ignored.join(", "))
                .with_path(path.to_string()),
        );
    }
}
