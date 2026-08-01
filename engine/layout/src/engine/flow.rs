//! Flow-section placement: the flow item walk and the absolute-body
//! item walk; the paginating cursor lives in [`layouter`].

mod layouter;

pub(in crate::engine) use layouter::{FlowLayouter, MAX_PAGES};

use crate::boxes::translate_boxes;
use shojiku_core::Item;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::flex::h_auto_margin;
use super::{translate, Basis, Ctx, PageBuild};

impl<'a, 'b> Ctx<'a, 'b> {
    pub(super) fn layout_flow(
        &mut self,
        flow: &shojiku_core::FlowBody,
        page: &Basis,
    ) -> Vec<PageBuild> {
        // The flow box resolves against the page margin box; omitted, the
        // flow occupies the whole margin box (PM1).
        let page_h = page.h.unwrap_or(0.0);
        let (x, y, w, h) = match &flow.box_ {
            Some(b) => (
                page.x + self.resolve_x(Some(b.x), page).unwrap_or(0.0),
                self.resolve_y(Some(b.y), page).unwrap_or(0.0),
                self.resolve_x(Some(b.w), page).unwrap_or(page.w),
                self.resolve_y(Some(b.h), page).unwrap_or(page_h),
            ),
            None => (page.x, 0.0, page.w, page_h),
        };
        let region = Basis {
            x,
            w,
            h: Some(h),
            font: self.font_rel(),
        };
        let mut layouter = FlowLayouter::new(&region, y, y + h);
        // A hostile negative gap would walk the cursor backwards into
        // already-placed content; clamp to 0 (CSS gaps are non-negative,
        // matching `repeat_flow`). `%` resolves against the region height.
        let gap = self.resolve_y(flow.gap(), &region).unwrap_or(0.0).max(0.0);

        let body_mark = self.enter_item("sections.body".to_string());
        for (index, item) in flow.items.iter().enumerate() {
            if index > 0 {
                layouter.add_gap(gap);
            }
            let item_mark = self.enter_item(format!("items[{index}]"));
            match item {
                Item::Text(text) => {
                    // Splits across pages when taller than the region
                    // (LT1); otherwise places atom-unit with horizontal
                    // auto margins, like every flow item.
                    self.place_flow_text(text, &region, &mut layouter);
                }
                Item::Rect(rect) => {
                    if let Some(atom) = self.rect_atom(rect, &region) {
                        layouter.place(h_auto_margin(atom, &region), &mut self.diags);
                    }
                }
                Item::Line(line) => {
                    let atom = self.line_atom(line, region.x);
                    layouter.place(atom, &mut self.diags);
                }
                Item::Table(table) => {
                    self.place_table(table, &region, &mut layouter);
                }
                Item::Image(image) => {
                    if let Some(atom) = self.image_atom(image, &region) {
                        layouter.place(h_auto_margin(atom, &region), &mut self.diags);
                    }
                }
                Item::Container(container) => {
                    // Flow ignores `box.y` (items stack), like every other
                    // flow item.
                    if let Some(atom) = self.container_atom(container, &region, 1) {
                        layouter.place(h_auto_margin(atom, &region), &mut self.diags);
                    }
                }
                Item::Repeat(repeat) => {
                    self.place_repeat(repeat, &region, &mut layouter);
                }
                Item::RepeatFlow(rf) => {
                    self.place_repeat_flow(rf, &region, &mut layouter);
                }
                Item::QrCode(qr) => {
                    if let Some(atom) = self.qr_atom(qr, &region) {
                        layouter.place(h_auto_margin(atom, &region), &mut self.diags);
                    }
                }
                Item::List(list) => {
                    if let Some(atom) = self.list_atom(list, &region) {
                        layouter.place(h_auto_margin(atom, &region), &mut self.diags);
                    }
                }
                Item::CharGrid(grid) => {
                    self.place_char_grid(grid, &region, &mut layouter);
                }
                Item::Ellipse(e) => {
                    if let Some(atom) = self.ellipse_atom(e, &region) {
                        layouter.place(h_auto_margin(atom, &region), &mut self.diags);
                    }
                }
                Item::Checkbox(c) => {
                    if let Some(atom) = self.checkbox_atom(c, &region) {
                        layouter.place(h_auto_margin(atom, &region), &mut self.diags);
                    }
                }
                Item::PageBreak(_) => {
                    // A break at the top of an untouched page is a no-op,
                    // so consecutive breaks collapse instead of emitting
                    // blank pages; the page cap is enforced by break_page.
                    if !layouter.fresh_page {
                        layouter.break_page(&mut self.diags);
                    }
                }
                Item::PageNumber(_) => {
                    self.diags.push(Diagnostic::new(Code::PageNumberInBody));
                }
            }
            self.leave_item(item_mark);
        }
        self.leave_item(body_mark);
        layouter.pages
    }

    pub(super) fn place_absolute_item(&mut self, item: &Item, basis: &Basis, page: &mut PageBuild) {
        match item {
            Item::Text(text) => {
                let b = text.box_.clone().unwrap_or_default();
                let dy = self.resolve_y(b.y, basis).unwrap_or(0.0);
                let atom = self.text_atom(text, basis);
                page.items.extend(translate(&atom.items, dy));
                page.boxes.extend(translate_boxes(&atom.boxes, dy));
            }
            Item::Rect(rect) => {
                if let Some(atom) = self.rect_atom(rect, basis) {
                    let dy = self.resolve_y(rect.box_.y, basis).unwrap_or(0.0);
                    page.items.extend(translate(&atom.items, dy));
                    page.boxes.extend(translate_boxes(&atom.boxes, dy));
                }
            }
            Item::Line(line) => {
                // Absolute lines use their own coordinates, offset to the
                // margin origin (`basis.x`; y is the assembly translate).
                // Built by the shared `line_atom` so the stroke pattern
                // cannot drift between placement contexts.
                let atom = self.line_atom(line, basis.x);
                page.items.extend(atom.items);
                page.boxes.extend(atom.boxes);
            }
            Item::Image(image) => {
                if let Some(atom) = self.image_atom(image, basis) {
                    let dy = self
                        .resolve_y(image.box_.clone().unwrap_or_default().y, basis)
                        .unwrap_or(0.0);
                    page.items.extend(translate(&atom.items, dy));
                    page.boxes.extend(translate_boxes(&atom.boxes, dy));
                }
            }
            Item::Container(container) => {
                let dy = self
                    .resolve_y(container.box_.clone().unwrap_or_default().y, basis)
                    .unwrap_or(0.0);
                if let Some(atom) = self.container_atom(container, basis, 1) {
                    page.items.extend(translate(&atom.items, dy));
                    page.boxes.extend(translate_boxes(&atom.boxes, dy));
                }
            }
            Item::QrCode(qr) => {
                if let Some(atom) = self.qr_atom(qr, basis) {
                    let dy = self
                        .resolve_y(qr.box_.clone().unwrap_or_default().y, basis)
                        .unwrap_or(0.0);
                    page.items.extend(translate(&atom.items, dy));
                    page.boxes.extend(translate_boxes(&atom.boxes, dy));
                }
            }
            Item::List(list) => {
                if let Some(atom) = self.list_atom(list, basis) {
                    let dy = self
                        .resolve_y(list.box_.clone().unwrap_or_default().y, basis)
                        .unwrap_or(0.0);
                    page.items.extend(translate(&atom.items, dy));
                    page.boxes.extend(translate_boxes(&atom.boxes, dy));
                }
            }
            Item::CharGrid(grid) => {
                if let Some(atom) = self.char_grid_atom(grid, basis) {
                    let dy = self
                        .resolve_y(grid.box_.clone().unwrap_or_default().y, basis)
                        .unwrap_or(0.0);
                    page.items.extend(translate(&atom.items, dy));
                    page.boxes.extend(translate_boxes(&atom.boxes, dy));
                }
            }
            Item::Ellipse(e) => {
                if let Some(atom) = self.ellipse_atom(e, basis) {
                    let dy = self.resolve_y(e.box_.y, basis).unwrap_or(0.0);
                    page.items.extend(translate(&atom.items, dy));
                    page.boxes.extend(translate_boxes(&atom.boxes, dy));
                }
            }
            Item::Checkbox(c) => {
                if let Some(atom) = self.checkbox_atom(c, basis) {
                    let dy = self
                        .resolve_y(super::marks::box_y(c.box_.as_ref()), basis)
                        .unwrap_or(0.0);
                    page.items.extend(translate(&atom.items, dy));
                    page.boxes.extend(translate_boxes(&atom.boxes, dy));
                }
            }
            Item::Table(table) => {
                // A table in an absolute body is one bounded block at
                // `box.y` (no pagination — the flow body still paginates).
                let dy = self
                    .resolve_y(table.box_.clone().unwrap_or_default().y, basis)
                    .unwrap_or(0.0);
                if let Some(atom) = self.guarded_table_atom(table, basis) {
                    page.items.extend(translate(&atom.items, dy));
                    page.boxes.extend(translate_boxes(&atom.boxes, dy));
                }
            }
            Item::Repeat(_) => {
                self.diags.push(Diagnostic::new(Code::RepeatInAbsoluteBody));
            }
            Item::RepeatFlow(_) => {
                self.diags
                    .push(Diagnostic::new(Code::RepeatFlowInAbsoluteBody));
            }
            Item::PageBreak(_) => {
                self.diags
                    .push(Diagnostic::new(Code::PageBreakInAbsoluteBody));
            }
            Item::PageNumber(_) => {
                self.diags.push(Diagnostic::new(Code::PageNumberInBody));
            }
        }
    }
}
