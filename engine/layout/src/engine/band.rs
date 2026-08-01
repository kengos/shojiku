//! Header/footer bands: per-page item placement and `page_number`
//! substitution ({page}/{pages}).

use crate::boxes::translate_boxes;
use shojiku_core::{Band, Item, PageNumberItem, WritingMode};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::{placed_box, translate, with_vertical_margin, Basis, Ctx, PageBuild};

impl<'a, 'b> Ctx<'a, 'b> {
    pub(super) fn layout_band(
        &mut self,
        band: &Band,
        base: &str,
        page_no: usize,
        total: usize,
        basis: &Basis,
    ) -> PageBuild {
        if !band.repeat().applies_to(page_no, total) {
            return PageBuild::default();
        }
        let mut out = PageBuild::default();
        let band_mark = self.enter_item(base.to_string());
        for (i, item) in band.items.iter().enumerate() {
            let item_mark = self.enter_item(format!("items[{i}]"));
            match item {
                Item::Text(text) => {
                    let b = text.box_.clone().unwrap_or_default();
                    let dy = self.resolve_y(b.y, basis).unwrap_or(0.0);
                    let atom = self.text_atom(text, basis);
                    out.items.extend(translate(&atom.items, dy));
                    out.boxes.extend(translate_boxes(&atom.boxes, dy));
                }
                Item::PageNumber(pn) => {
                    let block = self.page_number_items(pn, page_no, total, basis);
                    out.items.extend(block.items);
                    out.boxes.extend(block.boxes);
                }
                Item::Rect(rect) => {
                    if let Some(atom) = self.rect_atom(rect, basis) {
                        let dy = self.resolve_y(rect.box_.y, basis).unwrap_or(0.0);
                        out.items.extend(translate(&atom.items, dy));
                        out.boxes.extend(translate_boxes(&atom.boxes, dy));
                    }
                }
                Item::Line(line) => {
                    // Band lines use their own coordinates, offset to the
                    // margin origin (`basis.x`; y is the assembly
                    // translate). Built by the shared `line_atom` so the
                    // stroke pattern cannot drift between contexts.
                    let atom = self.line_atom(line, basis.x);
                    out.items.extend(atom.items);
                    out.boxes.extend(atom.boxes);
                }
                Item::Image(image) => {
                    if let Some(atom) = self.image_atom(image, basis) {
                        let dy = self
                            .resolve_y(image.box_.clone().unwrap_or_default().y, basis)
                            .unwrap_or(0.0);
                        out.items.extend(translate(&atom.items, dy));
                        out.boxes.extend(translate_boxes(&atom.boxes, dy));
                    }
                }
                Item::Container(container) => {
                    let dy = self
                        .resolve_y(container.box_.clone().unwrap_or_default().y, basis)
                        .unwrap_or(0.0);
                    if let Some(atom) = self.container_atom(container, basis, 1) {
                        out.items.extend(translate(&atom.items, dy));
                        out.boxes.extend(translate_boxes(&atom.boxes, dy));
                    }
                }
                Item::QrCode(qr) => {
                    if let Some(atom) = self.qr_atom(qr, basis) {
                        let dy = self
                            .resolve_y(qr.box_.clone().unwrap_or_default().y, basis)
                            .unwrap_or(0.0);
                        out.items.extend(translate(&atom.items, dy));
                        out.boxes.extend(translate_boxes(&atom.boxes, dy));
                    }
                }
                Item::List(list) => {
                    if let Some(atom) = self.list_atom(list, basis) {
                        let dy = self
                            .resolve_y(list.box_.clone().unwrap_or_default().y, basis)
                            .unwrap_or(0.0);
                        out.items.extend(translate(&atom.items, dy));
                        out.boxes.extend(translate_boxes(&atom.boxes, dy));
                    }
                }
                Item::CharGrid(grid) => {
                    if let Some(atom) = self.char_grid_atom(grid, basis) {
                        let dy = self
                            .resolve_y(grid.box_.clone().unwrap_or_default().y, basis)
                            .unwrap_or(0.0);
                        out.items.extend(translate(&atom.items, dy));
                        out.boxes.extend(translate_boxes(&atom.boxes, dy));
                    }
                }
                Item::Ellipse(e) => {
                    if let Some(atom) = self.ellipse_atom(e, basis) {
                        let dy = self.resolve_y(e.box_.y, basis).unwrap_or(0.0);
                        out.items.extend(translate(&atom.items, dy));
                        out.boxes.extend(translate_boxes(&atom.boxes, dy));
                    }
                }
                Item::Checkbox(c) => {
                    if let Some(atom) = self.checkbox_atom(c, basis) {
                        let dy = self
                            .resolve_y(super::marks::box_y(c.box_.as_ref()), basis)
                            .unwrap_or(0.0);
                        out.items.extend(translate(&atom.items, dy));
                        out.boxes.extend(translate_boxes(&atom.boxes, dy));
                    }
                }
                Item::Table(table) => {
                    // A table in a band is one bounded block at `box.y`.
                    let dy = self
                        .resolve_y(table.box_.clone().unwrap_or_default().y, basis)
                        .unwrap_or(0.0);
                    if let Some(atom) = self.guarded_table_atom(table, basis) {
                        out.items.extend(translate(&atom.items, dy));
                        out.boxes.extend(translate_boxes(&atom.boxes, dy));
                    }
                }
                Item::Repeat(_) => {
                    self.diags.push(Diagnostic::new(Code::RepeatInBand));
                }
                Item::RepeatFlow(_) => {
                    self.diags.push(Diagnostic::new(Code::RepeatFlowInBand));
                }
                Item::PageBreak(_) => {
                    self.diags.push(Diagnostic::new(Code::PageBreakInBand));
                }
            }
            self.leave_item(item_mark);
        }
        self.leave_item(band_mark);
        out
    }

    fn page_number_items(
        &mut self,
        pn: &PageNumberItem,
        page_no: usize,
        total: usize,
        basis: &Basis,
    ) -> PageBuild {
        let content = pn
            .format()
            .replace("{page}", &page_no.to_string())
            .replace("{pages}", &total.to_string());
        let b = pn.box_.clone().unwrap_or_default();
        let rb = self.resolve_box(&b, basis);
        let w = rb.w_or_fill(basis, 1.0);
        let dy = self.resolve_y(b.y, basis).unwrap_or(0.0);
        let computed = self.resolve_style(&pn.style_names, &pn.style);
        // Band boxes carry no min/max height (D3 is item-box scoped). A
        // vertical writing mode makes the page number a vertical-writing column; the
        // band's margin-box height is the inline basis its column wraps
        // against (`page_number` is short, so this rarely wraps).
        let mut atom = if computed.writing_mode == WritingMode::VerticalRl {
            self.vertical_text_block(
                &content,
                &computed,
                rb.x,
                w,
                rb.h,
                basis.h.unwrap_or(0.0),
                rb.padding,
            )
        } else {
            self.text_block(&content, &computed, rb.x, w, rb.h, rb.padding, (None, None))
        };
        atom.boxes.push(placed_box(
            &self.current_path(),
            pn.id.as_deref(),
            &rb,
            w,
            atom.height,
        ));
        let block = with_vertical_margin(atom, rb.margin[0], rb.margin[2]);
        PageBuild {
            items: translate(&block.items, dy),
            boxes: translate_boxes(&block.boxes, dy),
        }
    }
}
