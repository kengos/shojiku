//! The paginating flow cursor: page breaks, the page cap, and atom
//! placement (vertical fit + the horizontal-overflow check).

use std::ops::{Deref, DerefMut};

use crate::boxes::translate_boxes;
use crate::engine::overflow::exceeds;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};

use super::super::{Atom, Basis, PageBuild, translate};

/// Hard cap to keep a runaway template from looping forever. Shared with
/// `char_grid`, whose cell-assignment cap derives from it.
pub(in crate::engine) const MAX_PAGES: usize = 500;

/// The pages a flow has built: never empty, because the only constructor
/// takes the first page, and only growable, because there is no method
/// that removes one.
pub(in crate::engine) struct PageBuilds(Vec<PageBuild>);

impl PageBuilds {
    fn new(first: PageBuild) -> Self {
        Self(vec![first])
    }

    fn push(&mut self, page: PageBuild) {
        self.0.push(page);
    }

    /// The page being filled (the newest one).
    fn last_mut(&mut self) -> &mut PageBuild {
        let last = self.0.len() - 1;
        &mut self.0[last]
    }

    /// The finished pages, in order.
    pub(in crate::engine) fn into_vec(self) -> Vec<PageBuild> {
        self.0
    }
}

impl Deref for PageBuilds {
    type Target = [PageBuild];

    fn deref(&self) -> &[PageBuild] {
        &self.0
    }
}

impl DerefMut for PageBuilds {
    fn deref_mut(&mut self) -> &mut [PageBuild] {
        &mut self.0
    }
}

/// Flow placement state across pages.
pub(in crate::engine) struct FlowLayouter {
    pub(in crate::engine) pages: PageBuilds,
    pub(in crate::engine) region_top: f64,
    pub(in crate::engine) region_bottom: f64,
    /// The region's horizontal extent, for the horizontal-overflow
    /// check in [`FlowLayouter::place`].
    region_x: f64,
    region_w: f64,
    pub(in crate::engine) cursor: f64,
    /// No atom placed yet on the current page.
    pub(in crate::engine) fresh_page: bool,
    pub(in crate::engine) truncated: bool,
}

impl FlowLayouter {
    pub(in crate::engine) fn new(region: &Basis, region_top: f64, region_bottom: f64) -> Self {
        Self {
            pages: PageBuilds::new(PageBuild::default()),
            region_top,
            region_bottom,
            region_x: region.x,
            region_w: region.w,
            cursor: region_top,
            fresh_page: true,
            truncated: false,
        }
    }

    pub(in crate::engine) fn fits(&self, height: f64) -> bool {
        self.cursor + height <= self.region_bottom
    }

    pub(in crate::engine) fn add_gap(&mut self, gap: f64) {
        if !self.fresh_page {
            self.cursor += gap;
        }
    }

    /// Starts a new page; returns false when the page cap is hit.
    pub(in crate::engine) fn break_page(&mut self, diags: &mut Diagnostics) -> bool {
        if self.pages.len() >= MAX_PAGES {
            if !self.truncated {
                diags.push(Diagnostic::new(Code::PageOverflow).arg("max", MAX_PAGES));
                self.truncated = true;
            }
            return false;
        }
        self.pages.push(PageBuild::default());
        self.cursor = self.region_top;
        self.fresh_page = true;
        true
    }

    /// The page at index `target` (0-based), starting new pages until it exists.
    /// `None` only when `break_page` refuses a new page at `MAX_PAGES`.
    pub(in crate::engine) fn page_at(
        &mut self,
        target: usize,
        diags: &mut Diagnostics,
    ) -> Option<&mut PageBuild> {
        while self.pages.len() <= target {
            if !self.break_page(diags) {
                return None;
            }
        }
        self.pages.get_mut(target)
    }

    /// Places an atom at the cursor, breaking the page first if needed.
    pub(in crate::engine) fn place(&mut self, atom: Atom, diags: &mut Diagnostics) {
        if self.truncated {
            return;
        }
        // A definite-width atom reaching past the region's right edge
        // renders off-sheet with nothing else to say so (the vertical
        // counterpart is `section_overflow`). Filling atoms (rb.w None)
        // can't overflow; auto-margin shifts only move atoms that fit.
        if let Some((rb, w)) = atom.rb.and_then(|rb| rb.w.map(|w| (rb, w))) {
            let reach = (rb.x - self.region_x) + w + rb.margin[1];
            if exceeds(reach, self.region_w) {
                diags.push(
                    Diagnostic::new(Code::FlowItemOverflow)
                        .arg("over", reach - self.region_w)
                        .arg("avail", self.region_w),
                );
            }
        }
        if !self.fits(atom.height) && !self.fresh_page && !self.break_page(diags) {
            return;
        }
        if !self.fits(atom.height) {
            diags.push(Diagnostic::new(Code::SectionOverflow));
        }
        let page = self.pages.last_mut();
        page.items.extend(translate(&atom.items, self.cursor));
        page.boxes.extend(translate_boxes(&atom.boxes, self.cursor));
        self.cursor += atom.height;
        self.fresh_page = false;
    }
}
