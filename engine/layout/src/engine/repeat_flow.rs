//! Flow repeat (`type: repeat_flow`, IG1): one auto-height card per
//! array element, stacked in flow with `gap` and paginating card-by-card.

use shojiku_core::RepeatFlowItem;
use std::rc::Rc;

use super::flex::h_auto_margin;
use super::flow::FlowLayouter;
use super::fragments::Fragments;
use super::{Basis, Ctx, Scope};

impl<'a, 'b> Ctx<'a, 'b> {
    /// Places a `repeat_flow`: one element-scoped card (`item`, a
    /// container) per array element, laid out at the flow cursor like any
    /// stacked flow item — auto height, `gap` between cards, paginating
    /// card-by-card via [`FlowLayouter::place`] (a card that does not fit
    /// breaks to the next page whole; one taller than the region overflows
    /// with `section_overflow`, like any flow atom). Unlike the n-up
    /// `repeat`, no fresh page is forced: cards start wherever the cursor
    /// is. Cards inherit the ambient style cascade; the card's own
    /// `style`/`styleNames` cascade to its children via `container_atom`.
    pub(super) fn place_repeat_flow(
        &mut self,
        rf: &RepeatFlowItem,
        region: &Basis,
        layouter: &mut FlowLayouter,
    ) {
        let key = &rf.data.key;
        let Some(elements) = self.array_elements(key, "repeat_flow") else {
            return;
        };
        // A hostile negative gap would walk the cursor backwards into
        // already-placed content; clamp to 0 (CSS gaps are non-negative).
        let gap = self.resolve_y(rf.gap, region).unwrap_or(0.0).max(0.0);

        // The `repeat_flow` item accepts an `id:` but places no atom of its
        // own — only cards land. Track each page's card extent so the item
        // itself gets a per-page box-index fragment (same as `table`; cards
        // share a page merge into one span, absorbing the inter-card gap).
        let mut frags = Fragments::default();
        let saved_scope = self.scope.take();
        for (i, element) in elements.into_iter().enumerate() {
            // Past the page cap the layouter drops everything anyway;
            // stop building card atoms instead of looping the whole array.
            if layouter.truncated {
                break;
            }
            if i > 0 {
                layouter.add_gap(gap);
            }
            self.scope = Some(Scope {
                element: Rc::new(element),
                array_key: key.clone(),
                index: i,
            });
            // The card container is addressable as `…items[i].item`; its
            // children become `…item.items[j]` via `container_atom`.
            let card_mark = self.enter_item("item".to_string());
            if let Some(atom) = self.container_atom(&rf.item, region, 1) {
                let atom = h_auto_margin(atom, region);
                let height = atom.height;
                layouter.place(atom, &mut self.diags);
                frags.track(layouter, height);
            }
            self.leave_item(card_mark);
        }
        self.scope = saved_scope;
        // Back at the item path (`…items[i]`) after the final pop.
        frags.emit(
            &self.current_path(),
            rf.id.as_deref(),
            region.x,
            region.w,
            layouter,
        );
    }
}
