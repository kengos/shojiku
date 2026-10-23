//! Header/footer bands: per-page item placement and `page_number`
//! substitution ({page}/{pages}).

use shojiku_core::{Band, PageNumberItem, WritingMode};

use super::absolute::Placement;
use super::visibility::{self, Visibility};
use super::{Atom, Basis, Ctx, PageBuild, placed_box, with_vertical_margin};

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
        let anchors = self.pending_anchors.len();
        let visibility = self.child_visibility(&band.items);
        for (i, item) in band.items.iter().enumerate() {
            if visibility[i].is_collapsed() {
                continue;
            }
            // A band item is absolutely placed, so hiding and collapsing
            // look identical on the page; they differ only in whether a
            // `PlacedBox` is reported for the Designer to ghost.
            let mark = (visibility[i] == Visibility::Hidden).then(|| {
                visibility::draw_mark(std::slice::from_ref(&out), self.pending_anchors.len())
            });
            let item_mark = self.enter_item(format!("items[{i}]"));
            // `emit_placed` is the one tail that translates the atom onto
            // the page AND checks the sheet edge — a band item is placed
            // straight onto paper, so nothing else would catch it running
            // off the sheet.
            let placement = Placement::Band { page_no, total };
            if let Some((atom, dy)) = self.absolute_atom(item, basis, placement) {
                self.emit_placed(&mut out, atom, dy, basis);
            }
            self.leave_item(item_mark);
            if let Some(mark) = mark {
                visibility::blank_since(
                    std::slice::from_mut(&mut out),
                    &mark,
                    &mut self.pending_anchors,
                );
            }
        }
        self.leave_item(band_mark);
        // Every anchored item this band deferred is a copy for THIS page.
        self.pin_to_band_page(anchors, page_no - 1);
        out
    }

    /// The `page_number` atom plus its `box.y` offset — returned rather
    /// than emitted so it rides the same `emit_placed` tail (and the same
    /// sheet-edge check) as every other band item.
    pub(super) fn page_number_atom(
        &mut self,
        pn: &PageNumberItem,
        page_no: usize,
        total: usize,
        basis: &Basis,
    ) -> (Atom, f64) {
        let content = pn
            .format()
            .replace("{page}", &page_no.to_string())
            .replace("{pages}", &total.to_string());
        let b = pn.box_.clone().unwrap_or_default();
        let rb = self.resolve_box(&b, basis);
        let w = rb.w_or_fill(basis, 1.0);
        let dy = self.resolve_y(b.y, basis).unwrap_or(0.0);
        let computed = self.resolve_style(&pn.style_names, &pn.style);
        // Band boxes carry no min/max height (the bounds are item-box scoped). A
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
        (with_vertical_margin(atom, rb.margin[0], rb.margin[2]), dy)
    }
}
