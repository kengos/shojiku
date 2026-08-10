//! The drain: every deferred item, resolved against the finished pages.
//!
//! Runs after the per-page assembly loop, so the box index it reads is
//! already in SHEET coordinates (the margin translate has happened). The
//! resolved geometry therefore needs no further translation — and the
//! coordinate half of a mixed line, which resolves here against the page
//! margin box, is lifted by the top margin to match.

use std::collections::HashMap;

use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::band::{glyph_band, BAND_PAD_FRACTION};
use super::{anchor_point, PendingAnchor, PendingEllipse, PendingEnd, PendingKind, PendingLine};
use crate::boxes::PlacedBox;
use crate::engine::marks::ellipse_cmds;
use crate::engine::{line_placed_box, placed_box_rect, Basis, Ctx, PageBuild};
use crate::tree::{LayoutItem, PathShape};

/// A resolved deferred item: its page, what it draws, and its placement.
/// `None` when the anchor could not be resolved (the fault is reported).
type Resolved = Option<(usize, Vec<LayoutItem>, PlacedBox)>;

/// Where one endpoint landed, and on which page.
struct Landing {
    point: (f64, f64),
    page: Option<usize>,
}

/// Every anchorable placement, by id — built ONCE for the whole drain.
///
/// Resolution would otherwise be O(anchors x placements): both are driven by
/// the template, so a document with many leaders over many rows would pay a
/// product, which is a hang rather than a slowdown. One pass to build, one
/// hash lookup per endpoint.
///
/// It is built BEFORE anything is drawn, which also settles a question the
/// scan left to ordering: an anchored item is never itself an anchor TARGET.
/// A line anchored to its own id resolves to nothing, and an A->B / B->A pair
/// is impossible by construction rather than by luck.
struct TargetIndex<'p> {
    /// The first placement of each id, in (page, document) order.
    first: HashMap<&'p str, (usize, &'p PlacedBox)>,
    /// Ids with more than one placement on their own first page.
    duplicated: std::collections::HashSet<&'p str>,
}

impl<'p> TargetIndex<'p> {
    fn build(pages: &'p [PageBuild]) -> TargetIndex<'p> {
        let mut first: HashMap<&str, (usize, &PlacedBox)> = HashMap::new();
        let mut duplicated = std::collections::HashSet::new();
        for (index, page) in pages.iter().enumerate() {
            for b in &page.boxes {
                let Some(id) = b.id.as_deref() else {
                    continue;
                };
                match first.get(id) {
                    // Only a repeat on the id's OWN page is ambiguous: the
                    // same item on a later page is the ordinary
                    // one-placement-per-page case.
                    Some((page_of, _)) if *page_of == index => {
                        duplicated.insert(id);
                    }
                    Some(_) => {}
                    None => {
                        first.insert(id, (index, b));
                    }
                }
            }
        }
        TargetIndex { first, duplicated }
    }
}

impl Ctx<'_, '_> {
    /// Draws every deferred item onto the page its target landed on.
    ///
    /// Appended AFTER that page's in-flow content, so anchored items paint
    /// last — CSS 2.1 Appendix E paints positioned content above in-flow
    /// content, and an anchor-positioned box is positioned by definition.
    pub(in crate::engine) fn drain_anchors(
        &mut self,
        pages: &mut [PageBuild],
        basis: &Basis,
        top_margin: f64,
    ) {
        let pending = std::mem::take(&mut self.pending_anchors);
        if pending.is_empty() {
            return;
        }
        // Resolve every endpoint against the index of the pages AS LAID OUT,
        // then draw. Two passes rather than one so that what an anchor can
        // see does not depend on how far the drain has got.
        let resolved: Vec<Resolved> = {
            let index = TargetIndex::build(pages);
            pending
                .iter()
                .map(|p| match &p.kind {
                    PendingKind::Line(line) => {
                        self.resolve_line(p, line, &index, basis, top_margin)
                    }
                    PendingKind::Ellipse(e) => self.resolve_ellipse(p, e, &index),
                })
                .collect()
        };
        for (p, r) in pending.iter().zip(resolved) {
            if let Some((page, items, placed)) = r {
                self.emit_anchored(&mut pages[page], p, items, placed);
            }
        }
    }

    fn resolve_line(
        &mut self,
        p: &PendingAnchor,
        line: &PendingLine,
        index: &TargetIndex<'_>,
        basis: &Basis,
        top_margin: f64,
    ) -> Resolved {
        let from = self.land(&line.from, p, index, basis, top_margin)?;
        let to = self.land(&line.to, p, index, basis, top_margin)?;
        // The anchored end picks the page; a mixed line follows it there.
        // Two anchored ends on DIFFERENT pages have no page to draw on —
        // a line cannot span a sheet boundary.
        if let (Some(a), Some(b)) = (from.page, to.page) {
            if a != b {
                self.anchor_fault(Code::AnchorCrossPage, p, None);
                return None;
            }
        }
        // A pending line exists only because at least one endpoint is
        // anchored, and an anchored endpoint that landed carries its page —
        // so the default is unreachable, and written branch-free rather than
        // as an arm no test can enter.
        let page = from.page.or(to.page).unwrap_or_default();
        let mut stroke = line.stroke.clone();
        (stroke.x1, stroke.y1) = from.point;
        (stroke.x2, stroke.y2) = to.point;
        let items = if line.double {
            crate::engine::atoms::double_lines(&stroke)
        } else {
            vec![LayoutItem::Line(stroke)]
        };
        let mut b = line_placed_box(&p.path, p.id.as_deref(), from.point, to.point);
        b.hidden = p.hidden;
        Some((page, items, b))
    }

    fn resolve_ellipse(
        &mut self,
        p: &PendingAnchor,
        e: &PendingEllipse,
        index: &TargetIndex<'_>,
    ) -> Resolved {
        let (page, target) = self.find_target(&e.target, p, index)?;
        // Centred on the band, sized by the authored box — or by the band
        // PLUS clearance, which is the "circle this answer" case: an oval
        // on the band's exact extent crosses the glyphs it is circling.
        let band = glyph_band(target);
        let pad = band.h * BAND_PAD_FRACTION;
        let (w, h) = (
            e.size.0.unwrap_or(band.w + pad * 2.0),
            e.size.1.unwrap_or(band.h + pad * 2.0),
        );
        let (x, y) = (band.x + (band.w - w) / 2.0, band.y + (band.h - h) / 2.0);
        let items = if e.drawn {
            vec![LayoutItem::Path(PathShape {
                cmds: ellipse_cmds(x, y, w, h),
                stroke: e.paint.stroke,
                stroke_width: e.paint.width,
                fill: e.paint.fill,
                opacity: e.paint.opacity,
            })]
        } else {
            Vec::new()
        };
        let mut b = placed_box_rect(&p.path, p.id.as_deref(), x, y, w, h);
        b.hidden = p.hidden;
        Some((page, items, b))
    }

    /// A hidden item reports where it WOULD have drawn and draws nothing —
    /// the same contract `visibility::blank` gives every other item,
    /// applied here because a deferred item never rode the atom blanking
    /// transforms.
    fn emit_anchored(
        &mut self,
        out: &mut PageBuild,
        p: &PendingAnchor,
        items: Vec<LayoutItem>,
        placed: PlacedBox,
    ) {
        if !p.hidden {
            out.items.extend(items);
        }
        out.boxes.push(placed);
    }

    /// One endpoint's sheet point, or `None` when the line cannot be drawn
    /// at all (the fault has been reported).
    fn land(
        &mut self,
        end: &PendingEnd,
        p: &PendingAnchor,
        index: &TargetIndex<'_>,
        basis: &Basis,
        top_margin: f64,
    ) -> Option<Landing> {
        let a = match end {
            PendingEnd::Xy { x, y } => {
                // The absolute-line rule: a coordinate endpoint on an
                // anchored line resolves against the page margin box, then
                // lifts into sheet space like every assembled page.
                let x = basis.x + self.resolve_x(Some(*x), basis).unwrap_or(0.0);
                let y = self.resolve_y(Some(*y), basis).unwrap_or(0.0) + top_margin;
                return Some(Landing {
                    point: (x, y),
                    page: None,
                });
            }
            PendingEnd::Anchor(a) => a,
        };
        let (page, target) = self.find_target(&a.item, p, index)?;
        // A shift past the resolve cap drops the item with the same code
        // an over-range `%` endpoint gets, rather than sending an
        // unrenderable coordinate to the backend.
        let Some(point) = anchor_point(target, a) else {
            self.diags.push(
                Diagnostic::new(Code::LengthOutOfRange)
                    .arg("value", a.offset().x)
                    .arg("max", shojiku_layout_box::MAX_RESOLVED_PT),
            );
            return None;
        };
        Some(Landing {
            point,
            page: Some(page),
        })
    }

    /// The placement `id` names, from the prebuilt index. Reports the
    /// unknown-target and ambiguity faults, so every caller gets both.
    fn find_target<'p>(
        &mut self,
        id: &str,
        p: &PendingAnchor,
        index: &TargetIndex<'p>,
    ) -> Option<(usize, &'p PlacedBox)> {
        let Some(found) = index.first.get(id).copied() else {
            self.anchor_fault(Code::AnchorUnknownTarget, p, Some(id));
            return None;
        };
        if index.duplicated.contains(id) {
            self.anchor_fault(Code::AnchorAmbiguousTarget, p, Some(id));
        }
        Some(found)
    }

    /// Every anchor fault carries the authoring path of the ANCHORED item
    /// (the one that can be fixed) and echoes the id it looked for.
    fn anchor_fault(&mut self, code: Code, p: &PendingAnchor, item: Option<&str>) {
        let mut d = Diagnostic::new(code).with_path(p.path.clone());
        if let Some(item) = item {
            d = d.arg("item", item);
        }
        self.diags.push(d);
    }
}
