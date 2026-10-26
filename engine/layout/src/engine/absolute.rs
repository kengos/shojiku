//! The one absolute-placement dispatch: an item laid out at its authored
//! `box.y` in a band, the absolute body, or a container — plus the one
//! item walk the band and the absolute body share.
//!
//! These are the three contexts that place an item where it says rather
//! than where a flow cursor or a flex/grid track puts it. They take the
//! same kinds and build each one the same way; what differs is only
//! where `page_number` may draw, which warning a rejected kind raises,
//! and the depth a nested container lays out at — all three read off
//! [`Placement`].

use shojiku_core::Item;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::visibility::{self, Visibility};
use super::{Atom, Basis, Ctx, PageBuild, marks::box_y};

/// Where an absolutely placed item sits.
#[derive(Debug, Clone, Copy)]
pub(super) enum Placement {
    /// A header/footer band on page `page_no` of `total` — the only
    /// placement a `page_number` draws in.
    Band { page_no: usize, total: usize },
    /// The `type: absolute` body.
    Body,
    /// A positioned child of a container nested `depth` deep.
    Container { depth: usize },
}

impl Placement {
    /// The depth a `container` item placed here lays out at: a band or
    /// the body holds a top-level container, a container holds one level
    /// deeper.
    fn depth(self) -> usize {
        match self {
            Placement::Container { depth } => depth + 1,
            Placement::Band { .. } | Placement::Body => 1,
        }
    }

    /// Picks the one of three per-placement values (a rejected kind's
    /// warning) that belongs to this placement.
    fn pick<T>(self, band: T, body: T, container: T) -> T {
        match self {
            Placement::Band { .. } => band,
            Placement::Body => body,
            Placement::Container { .. } => container,
        }
    }
}

impl<'a, 'b> Ctx<'a, 'b> {
    /// Places a band's or the absolute body's items onto one page, each
    /// under its own `items[i]` path segment. The caller has entered the
    /// list's own segment (`sections.header`, `sections.body`, ...).
    ///
    /// The items are absolutely placed, so hiding and collapsing look
    /// identical on the page; they differ only in whether a `PlacedBox` is
    /// reported for the Designer to ghost. `emit_placed` is the one tail
    /// that translates the atom onto the page AND checks the sheet edge —
    /// the item is placed straight onto paper, so nothing else would catch
    /// it running off the sheet.
    pub(super) fn place_absolute_items(
        &mut self,
        items: &[Item],
        basis: &Basis,
        placement: Placement,
    ) -> PageBuild {
        let mut out = PageBuild::default();
        let visibility = self.child_visibility(items);
        for (i, item) in items.iter().enumerate() {
            if visibility[i].is_collapsed() {
                continue;
            }
            let mark = (visibility[i] == Visibility::Hidden).then(|| {
                visibility::draw_mark(std::slice::from_ref(&out), self.pending_anchors.len())
            });
            let item_mark = self.enter_item(format!("items[{i}]"));
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
        out
    }

    /// Lays out one absolutely placed item against `basis` and returns
    /// its atom plus its `box.y` offset, or `None` when the item draws
    /// nothing (a builder declined it, or `placement` does not take its
    /// kind and has warned). The caller emits the atom: a band and the
    /// body onto the page, a container into its children.
    pub(super) fn absolute_atom(
        &mut self,
        item: &Item,
        basis: &Basis,
        placement: Placement,
    ) -> Option<(Atom, f64)> {
        match item {
            Item::Text(text) => {
                let dy = self
                    .resolve_y(text.box_.clone().unwrap_or_default().y, basis)
                    .unwrap_or(0.0);
                Some((self.text_atom(text, basis), dy))
            }
            Item::Rect(rect) => {
                let atom = self.rect_atom(rect, basis)?;
                let dy = self.resolve_y(rect.box_.y, basis).unwrap_or(0.0);
                Some((atom, dy))
            }
            Item::Line(line) => {
                // Line endpoints are offsets from the basis top-left (the
                // margin box in a band or the body, the content box in a
                // container, so `to: { x: "100%" }` underlines a flex
                // child's full inner width); the endpoints ARE the offsets,
                // so there is no `dy`. A line carries no box, so in a band
                // or the body the sheet-edge check falls back to its
                // endpoint bbox.
                Some((self.line_atom(line, basis), 0.0))
            }
            Item::Image(image) => {
                let atom = self.guarded_image_atom(image, basis)?;
                let dy = self
                    .resolve_y(image.box_.clone().unwrap_or_default().y, basis)
                    .unwrap_or(0.0);
                Some((atom, dy))
            }
            Item::Container(container) => {
                let dy = self
                    .resolve_y(container.box_.clone().unwrap_or_default().y, basis)
                    .unwrap_or(0.0);
                let atom = self.container_atom(container, basis, placement.depth())?;
                Some((atom, dy))
            }
            Item::QrCode(qr) => {
                let atom = self.qr_atom(qr, basis)?;
                let dy = self
                    .resolve_y(qr.box_.clone().unwrap_or_default().y, basis)
                    .unwrap_or(0.0);
                Some((atom, dy))
            }
            Item::List(list) => {
                let atom = self.list_atom(list, basis)?;
                let dy = self
                    .resolve_y(list.box_.clone().unwrap_or_default().y, basis)
                    .unwrap_or(0.0);
                Some((atom, dy))
            }
            Item::Table(table) => {
                // A positioned table is one bounded block at `box.y` (no
                // pagination — only the flow body paginates).
                let dy = self
                    .resolve_y(table.box_.clone().unwrap_or_default().y, basis)
                    .unwrap_or(0.0);
                let atom = self.guarded_table_atom(table, basis)?;
                Some((atom, dy))
            }
            Item::CharGrid(grid) => {
                // One sheet: content past it warns `char_grid_overflow` and
                // is dropped (no pagination outside the flow body).
                let atom = self.char_grid_atom(grid, basis)?;
                let dy = self
                    .resolve_y(grid.box_.clone().unwrap_or_default().y, basis)
                    .unwrap_or(0.0);
                Some((atom, dy))
            }
            Item::Ellipse(e) => {
                let atom = self.ellipse_atom(e, basis)?;
                let dy = self.resolve_y(box_y(e.box_.as_ref()), basis).unwrap_or(0.0);
                Some((atom, dy))
            }
            Item::Checkbox(c) => {
                let atom = self.checkbox_atom(c, basis)?;
                let dy = self.resolve_y(box_y(c.box_.as_ref()), basis).unwrap_or(0.0);
                Some((atom, dy))
            }
            Item::PageNumber(pn) => match placement {
                Placement::Band { page_no, total } => {
                    Some(self.page_number_atom(pn, page_no, total, basis))
                }
                Placement::Body => self.reject(Code::PageNumberInBody),
                Placement::Container { .. } => self.reject(Code::PageNumberInContainer),
            },
            Item::Repeat(_) => self.reject(placement.pick(
                Code::RepeatInBand,
                Code::RepeatInAbsoluteBody,
                Code::RepeatInContainer,
            )),
            Item::RepeatFlow(_) => self.reject(placement.pick(
                Code::RepeatFlowInBand,
                Code::RepeatFlowInAbsoluteBody,
                Code::RepeatFlowInContainer,
            )),
            Item::PageBreak(_) => self.reject(placement.pick(
                Code::PageBreakInBand,
                Code::PageBreakInAbsoluteBody,
                Code::PageBreakInContainer,
            )),
        }
    }

    /// Warns that this placement does not take the item's kind; the item
    /// draws nothing.
    fn reject(&mut self, code: Code) -> Option<(Atom, f64)> {
        self.diags.push(Diagnostic::new(code));
        None
    }
}
