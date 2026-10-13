//! The target index the drain resolves against: every anchorable placement,
//! by page and id, built ONCE for the whole drain.
//!
//! Resolution would otherwise be O(anchors x placements): both are driven by
//! the template, so a document with many leaders over many rows would pay a
//! product, which is a hang rather than a slowdown. One pass to build, a
//! couple of hash lookups per endpoint.
//!
//! It is built BEFORE anything is drawn, which also settles a question the
//! scan left to ordering: an anchored item is never itself an anchor TARGET.
//! A line anchored to its own id resolves to nothing, and an A->B / B->A pair
//! is impossible by construction rather than by luck.

use std::collections::hash_map::Entry;
use std::collections::HashMap;

use crate::boxes::PlacedBox;
use crate::engine::PageBuild;

/// What a lookup found.
pub(super) enum Lookup<'p> {
    /// The first placement on the page the lookup settled on, and whether a
    /// second placement on that same page makes it ambiguous.
    Found {
        page: usize,
        target: &'p PlacedBox,
        ambiguous: bool,
    },
    /// The id is placed, just not on the page a band copy repeats on: that
    /// copy has nothing to draw there, and nothing is wrong.
    ElsewhereOnly,
    /// No placement anywhere carries the id.
    Unknown,
}

/// Every placement of one id: the first page it lands on, and per page the
/// first placement there plus whether a second one makes it ambiguous.
struct Placements<'p> {
    first_page: usize,
    pages: HashMap<usize, (&'p PlacedBox, bool)>,
}

pub(super) struct TargetIndex<'p> {
    by_id: HashMap<&'p str, Placements<'p>>,
}

impl<'p> TargetIndex<'p> {
    pub(super) fn build(pages: &'p [PageBuild]) -> TargetIndex<'p> {
        let mut by_id: HashMap<&str, Placements<'_>> = HashMap::new();
        for (page, build) in pages.iter().enumerate() {
            for b in &build.boxes {
                let Some(id) = b.id.as_deref() else {
                    continue;
                };
                let placements = by_id.entry(id).or_insert_with(|| Placements {
                    first_page: page,
                    pages: HashMap::new(),
                });
                // Only a repeat on the SAME page is ambiguous: the same item
                // on a later page is the ordinary one-placement-per-page case
                // of a band item or a repeated section.
                match placements.pages.entry(page) {
                    Entry::Occupied(mut seen) => seen.get_mut().1 = true,
                    Entry::Vacant(slot) => {
                        slot.insert((b, false));
                    }
                }
            }
        }
        TargetIndex { by_id }
    }

    /// Resolves `id` on `band_page` when the anchored item is a band copy
    /// (each copy repeats with its page), else on the first page the id is
    /// placed on — the body walk's rule, where an item is laid out once.
    pub(super) fn lookup(&self, id: &str, band_page: Option<usize>) -> Lookup<'p> {
        let Some(placements) = self.by_id.get(id) else {
            return Lookup::Unknown;
        };
        let page = band_page.unwrap_or(placements.first_page);
        match placements.pages.get(&page) {
            Some(&(target, ambiguous)) => Lookup::Found {
                page,
                target,
                ambiguous,
            },
            None => Lookup::ElsewhereOnly,
        }
    }
}
