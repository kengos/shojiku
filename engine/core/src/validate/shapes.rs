//! Shape-style checks: inert style keys on the inline style of `rect`/
//! `ellipse`/`checkbox`/text `mark` items (`shape_style_ignored`) — each
//! shape paints with only part of the box-decoration subset of [`Style`]
//! (`crate::facts::painted_by`).

use crate::facts::Surface;
use crate::style::Style;
use crate::template::{Item, Template};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};

use super::walk_sections;

/// Flags text/box keys that have no effect on a shape item's inline
/// style. Warnings only: layout ignores the keys deterministically, so
/// rendering still proceeds. Like the span check, named styles are not
/// flagged — a shared style bag may carry keys for its other users.
pub(super) fn check_shape_styles(template: &Template, diags: &mut Diagnostics) {
    walk_sections(template, &mut |item, path| {
        let surface = Surface::Item(item.kind());
        match item {
            Item::Rect(r) => flag_inert(&r.style, surface, "rect", path, diags),
            Item::Ellipse(e) => flag_inert(&e.style, surface, "ellipse", path, diags),
            Item::Checkbox(c) => flag_inert(&c.style, surface, "checkbox", path, diags),
            Item::Text(t) => {
                if let Some(mark) = &t.mark {
                    let path = format!("{path}.mark");
                    flag_inert(&mark.style, Surface::Mark, "mark", &path, diags);
                }
            }
            _ => {}
        }
    });
}

fn flag_inert(style: &Style, surface: Surface, item: &str, path: &str, diags: &mut Diagnostics) {
    let ignored = style.ignored_on(surface);
    if !ignored.is_empty() {
        diags.push(
            Diagnostic::new(Code::ShapeStyleIgnored)
                .arg("item", item)
                .arg("keys", ignored.join(", "))
                .with_path(path.to_string()),
        );
    }
}
