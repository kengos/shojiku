//! Containers: box resolution, the style cascade push/restore, and the
//! absolutely-positioned child atoms of the shared box-children walk
//! (the walk itself, with flex placement, lives in `super::flex`).

use shojiku_core::{BindingScope, ContainerItem, ImageItem, Item, Overflow, MAX_CONTAINER_DEPTH};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use crate::boxes::translate_boxes;
use crate::tree::{ClipShape, Corners, LayoutItem};

use super::{placed_box, translate, with_vertical_margin, Atom, Basis, Ctx};

/// Wraps a box's already-positioned children in a clip node over its
/// border box (`overflow: hidden`). The box's own decoration stays
/// outside — the clip hides overflowing *content*, not the box itself.
/// `radius` rounds the clipping box so a `borderRadius` box with
/// `overflow: hidden` cannot leak content past its rounded edge; the
/// text-overflow clips pass [`Corners::default`] (square) — a text clip
/// follows the text box, not a corner treatment.
pub(super) fn clip_children(
    items: Vec<LayoutItem>,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    radius: Corners,
) -> LayoutItem {
    LayoutItem::Clip(ClipShape {
        x,
        y,
        w,
        h,
        radius,
        items,
    })
}

impl<'a, 'b> Ctx<'a, 'b> {
    /// Lays out a container as an atom: the container's box resolves
    /// against `basis`, children resolve against the container and are
    /// positioned relative to its top edge (items carry absolute x,
    /// y relative to the atom top like every other atom). `box.h` omitted
    /// means auto height: the lowest child bottom edge plus padding.
    /// Border-box: padding insets the child basis inside `w`/`h`; margins
    /// space the container within its parent.
    pub(super) fn container_atom(
        &mut self,
        container: &ContainerItem,
        basis: &Basis,
        depth: usize,
    ) -> Option<Atom> {
        if depth > MAX_CONTAINER_DEPTH {
            self.diags.push(
                Diagnostic::new(Code::ContainerDepthExceeded).arg("max", MAX_CONTAINER_DEPTH),
            );
            return None;
        }
        let b = container.box_.clone().unwrap_or_default();
        let rb = self.resolve_box(&b, basis);
        let w = rb.w_or_fill(basis, 1.0);
        let h = rb.h_or_fill(basis);

        // Style cascade (inheritance): the container's own `style`
        // overrides what it inherited, and its children see those values
        // unless they override again. Restored after the subtree so
        // siblings are unaffected. Positioning uses `Basis`, a separate
        // axis that is never inherited — but pushed BEFORE `inner` is
        // built so a child `em` length sees the container's computed font
        // size (the container's own box above resolved with the parent's).
        let saved_style = self.inherited.clone();
        self.inherited = self.resolve_style(&container.style_names, &container.style);
        // The container's own computed style also carries its decoration
        // (backgroundColor / border), drawn under the children below.
        let computed = self.inherited.clone();

        // The content box children resolve against: the border box minus
        // padding, clamped so padding wider than the box cannot produce a
        // negative basis for `%` math.
        let inner = Basis {
            x: rb.content_x(),
            w: rb.content_w(w),
            h: h.map(|v| rb.content_h(v)),
            font: self.font_rel(),
            pct_w: None,
            fill_h: None,
        };

        let (items, child_boxes, bottom) = self.layout_box_children(
            &container.items,
            &inner,
            &b,
            depth,
            computed.overflow == shojiku_core::Overflow::Hidden,
        );

        self.inherited = saved_style;

        // `bottom` is measured from the content-box top; compare against
        // the content height (border box minus padding) and reserve the
        // border-box height.
        let height = match (h, inner.h) {
            (Some(h), Some(content_h)) => {
                // `overflow: hidden` clips instead of warning — the
                // author opted in; `visible` keeps the draw-over + warn.
                if bottom > content_h + 0.01 && computed.overflow == Overflow::Visible {
                    self.diags.push(
                        Diagnostic::new(Code::ContainerOverflow)
                            .arg("content", bottom)
                            .arg("avail", content_h),
                    );
                }
                h
            }
            // Auto height: the content height plus padding, clamped to
            // the min/max height bounds. A `maxHeight` shorter than
            // the content behaves like a definite `h` too short —
            // content overflows visually, no warning (the author set the
            // bound).
            _ => rb.clamp_h(bottom + rb.v_padding()),
        };
        let mut boxes = Vec::with_capacity(child_boxes.len() + 1);
        boxes.push(placed_box(
            &self.current_path(),
            container.id.as_deref(),
            &rb,
            w,
            height,
        ));
        // Children carry y relative to the content-box top, like items.
        boxes.extend(translate_boxes(&child_boxes, rb.padding[0]));
        // Decoration covers the border box (atom-relative y 0, no padding
        // shift) and paints before — under — the children.
        let mut all_items = Vec::with_capacity(items.len() + 1);
        let radius = self.push_decoration(&mut all_items, &computed, rb.x, w, height);
        let children = translate(&items, rb.padding[0]);
        if computed.overflow == Overflow::Hidden {
            all_items.push(clip_children(children, rb.x, 0.0, w, height, radius));
        } else {
            all_items.extend(children);
        }
        Some(with_vertical_margin(
            Atom {
                height,
                items: all_items,
                boxes,
                rb: Some(rb),
            },
            rb.margin[0],
            rb.margin[2],
        ))
    }

    /// Lays out one absolutely positioned box child (authored `box.x` or
    /// `box.y` — the Phase-1 escape hatch that every pre-flex template
    /// uses) and returns its atom plus vertical offset. `table` /
    /// `page_number` / `repeat` children are unsupported inside a box and
    /// warn+skip; nested containers recurse at `depth + 1`.
    pub(super) fn absolute_child_atom(
        &mut self,
        child: &Item,
        inner: &Basis,
        depth: usize,
    ) -> Option<(Atom, f64)> {
        match child {
            Item::Text(text) => {
                let dy = self
                    .resolve_y(text.box_.clone().unwrap_or_default().y, inner)
                    .unwrap_or(0.0);
                Some((self.text_atom(text, inner), dy))
            }
            Item::Rect(rect) => {
                let atom = self.rect_atom(rect, inner)?;
                let dy = self.resolve_y(rect.box_.y, inner).unwrap_or(0.0);
                Some((atom, dy))
            }
            Item::Line(line) => {
                // Line endpoints are offsets from the box top-left,
                // resolved against the container's CONTENT box — so
                // `to: { x: "100%" }` underlines the full inner width of
                // a flex child whose share was only known at layout time.
                Some((self.line_atom(line, inner), 0.0))
            }
            Item::Image(image) => {
                let atom = self.guarded_image_atom(image, inner)?;
                let dy = self
                    .resolve_y(image.box_.clone().unwrap_or_default().y, inner)
                    .unwrap_or(0.0);
                Some((atom, dy))
            }
            Item::Container(nested) => {
                let dy = self
                    .resolve_y(nested.box_.clone().unwrap_or_default().y, inner)
                    .unwrap_or(0.0);
                let atom = self.container_atom(nested, inner, depth + 1)?;
                Some((atom, dy))
            }
            Item::QrCode(qr) => {
                let atom = self.qr_atom(qr, inner)?;
                let dy = self
                    .resolve_y(qr.box_.clone().unwrap_or_default().y, inner)
                    .unwrap_or(0.0);
                Some((atom, dy))
            }
            Item::List(list) => {
                let atom = self.list_atom(list, inner)?;
                let dy = self
                    .resolve_y(list.box_.clone().unwrap_or_default().y, inner)
                    .unwrap_or(0.0);
                Some((atom, dy))
            }
            Item::Table(table) => {
                // A positioned table is one bounded block at `box.y`.
                let dy = self
                    .resolve_y(table.box_.clone().unwrap_or_default().y, inner)
                    .unwrap_or(0.0);
                let atom = self.guarded_table_atom(table, inner)?;
                Some((atom, dy))
            }
            Item::PageNumber(_) => {
                self.diags
                    .push(Diagnostic::new(Code::PageNumberInContainer));
                None
            }
            Item::Repeat(_) => {
                self.diags.push(Diagnostic::new(Code::RepeatInContainer));
                None
            }
            Item::RepeatFlow(_) => {
                self.diags
                    .push(Diagnostic::new(Code::RepeatFlowInContainer));
                None
            }
            Item::PageBreak(_) => {
                self.diags.push(Diagnostic::new(Code::PageBreakInContainer));
                None
            }
            Item::CharGrid(grid) => {
                // One sheet, band semantics (content past it warns
                // `char_grid_overflow` and is dropped — no pagination
                // inside a box).
                let atom = self.char_grid_atom(grid, inner)?;
                let dy = self
                    .resolve_y(grid.box_.clone().unwrap_or_default().y, inner)
                    .unwrap_or(0.0);
                Some((atom, dy))
            }
            Item::Ellipse(e) => {
                let atom = self.ellipse_atom(e, inner)?;
                let dy = self.resolve_y(e.box_.y, inner).unwrap_or(0.0);
                Some((atom, dy))
            }
            Item::Checkbox(c) => {
                let atom = self.checkbox_atom(c, inner)?;
                let dy = self
                    .resolve_y(super::marks::box_y(c.box_.as_ref()), inner)
                    .unwrap_or(0.0);
                Some((atom, dy))
            }
        }
    }

    /// Draws an image, resolving its asset key for the placement context.
    /// Inside a `repeat`/`repeat_flow` cell a `data:` binding is
    /// element-scoped (`dyn:<array>[<i>].<key>`), while a static `src:`
    /// stays shared; a top-level image (no scope) keeps its own
    /// `src:`/`dyn:` key. A `scope: document` binding takes the shared
    /// `dyn:<key>` id even inside a cell — one asset for the whole grid,
    /// matching what `shojiku_image::prepare_assets` loaded. Shared by the
    /// absolute and flex child walks.
    pub(super) fn guarded_image_atom(&mut self, image: &ImageItem, basis: &Basis) -> Option<Atom> {
        let key = match (self.scope.as_ref(), image.data.as_ref()) {
            (Some(scope), Some(binding))
                if image.src.is_none() && binding.scope() == BindingScope::Element =>
            {
                Some(shojiku_image::cell_asset_key(
                    &scope.array_key,
                    scope.index,
                    &binding.key,
                ))
            }
            _ => shojiku_image::asset_key(image),
        };
        self.image_atom_keyed(image, basis, key)
    }
}
