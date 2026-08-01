//! Context-inert authoring-key checks: keys that lay out nothing where
//! they are written. Box-layout keys (`box.type` / `direction` / `gap` /
//! `alignItems` / `justifyContent`) and grid keys (`columns` / `rows` /
//! `columnGap` / `rowGap`) only act on child-bearing boxes, so on a leaf
//! they warn (`layout_key_on_leaf`); grid keys additionally need
//! `box.type: grid` (`grid_key_ignored`); and table pagination keys only
//! act on a flow-body table (`table_pagination_key_ignored`).

use crate::geometry::{BoxType, OptBox};
use crate::template::{Body, Item, Template};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};

use super::walk_sections;

/// Warns on layout keys authored on leaf item boxes and on grid keys
/// without `type: grid` (everywhere: bands, body, containers, repeat
/// cells).
pub(super) fn check_box_keys(template: &Template, diags: &mut Diagnostics) {
    walk_sections(template, &mut |item, path| {
        // Containers and repeat cells are the layout-key users; lines
        // and tables have no box at all.
        let (leaf_box, layout_box): (Option<&OptBox>, Option<&OptBox>) = match item {
            Item::Text(t) => (t.box_.as_ref(), None),
            Item::Rect(r) => (Some(&r.box_), None),
            Item::Image(i) => (i.box_.as_ref(), None),
            Item::PageNumber(p) => (p.box_.as_ref(), None),
            Item::QrCode(q) => (q.box_.as_ref(), None),
            Item::List(l) => (l.box_.as_ref(), None),
            Item::CharGrid(g) => (g.box_.as_ref(), None),
            Item::Container(c) => (None, c.box_.as_ref()),
            Item::Repeat(r) => (None, r.cell.box_.as_ref()),
            Item::RepeatFlow(rf) => (None, rf.item.box_.as_ref()),
            Item::Ellipse(e) => (Some(&e.box_), None),
            Item::Checkbox(c) => (c.box_.as_ref(), None),
            Item::Line(_) | Item::Table(_) | Item::PageBreak(_) => (None, None),
        };
        if let Some(b) = leaf_box {
            if b.has_layout_keys() {
                diags.push(Diagnostic::new(Code::LayoutKeyOnLeaf).with_path(path.to_string()));
            }
        }
        if let Some(b) = layout_box {
            if b.has_grid_keys() && b.type_ != Some(BoxType::Grid) {
                diags.push(Diagnostic::new(Code::GridKeyIgnored).with_path(path.to_string()));
            }
        }
    });
}

/// `repeatHeader`/`autoPageBreak`/`keepTogether` only act on a flow-body
/// table (the only paginating context). On a table rendered as one
/// bounded block — inside a container, an absolute body, or a band — they
/// are inert; surface that so the mistake is not silent (the Designer's
/// only signal that the keys do nothing there). Cells of a `repeat`/
/// `repeat_flow` are skipped: a table there is unsupported
/// (`table_in_cell`) and already warns.
pub(super) fn check_table_pagination_keys(template: &Template, diags: &mut Diagnostics) {
    fn walk(items: &[Item], flow_ok: bool, prefix: &str, diags: &mut Diagnostics) {
        for (i, item) in items.iter().enumerate() {
            let path = format!("{prefix}[{i}]");
            match item {
                Item::Table(t) if !flow_ok => {
                    if t.auto_page_break.is_some()
                        || t.repeat_header.is_some()
                        || t.keep_together.is_some()
                    {
                        diags
                            .push(Diagnostic::new(Code::TablePaginationKeyIgnored).with_path(path));
                    }
                }
                Item::Container(c) => walk(&c.items, false, &format!("{path}.items"), diags),
                _ => {}
            }
        }
    }
    if let Some(header) = &template.sections.header {
        walk(&header.items, false, "sections.header.items", diags);
    }
    match &template.sections.body {
        Body::Flow(f) => walk(&f.items, true, "sections.body.items", diags),
        Body::Absolute(a) => walk(&a.items, false, "sections.body.items", diags),
    }
    if let Some(footer) = &template.sections.footer {
        walk(&footer.items, false, "sections.footer.items", diags);
    }
}
