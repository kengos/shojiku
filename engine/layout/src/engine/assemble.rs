//! The layout entry point: seeds the cascade root and the page basis,
//! walks the body, then assembles each page as header + body + footer in
//! sheet coordinates. The shared state it drives (`Ctx`, `PageBuild`,
//! `Atom`) lives in the module root; this file is only the pass itself.

use crate::boxes::{translate_boxes, BoxIndex};
use crate::style::ComputedStyle;
use crate::tree::{LayoutDocument, LayoutPage};
use shojiku_core::Body;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code, Diagnostics};

use super::visibility::{self, Visibility};
use super::{translate, Basis, Ctx, LayoutInput, LayoutOutput, PageBuild};

/// Lays out the template into pages.
pub fn layout(input: &LayoutInput) -> LayoutOutput {
    // The template's `defaults.style` is the cascade ROOT — every
    // item inherits from it, and the rem root follows its computed font
    // size (hostile sizes fall back to the engine default; text use
    // sites still warn via `sane_font_size`).
    let mut root = ComputedStyle::default();
    if let Some(style) = &input.template.defaults.style {
        root = root.overlaid(style);
        root.rem_root = if root.font_size.is_finite() && root.font_size > 0.0 {
            root.font_size
        } else {
            shojiku_core::DEFAULT_FONT_SIZE_PT
        };
    }
    let mut ctx = Ctx {
        input,
        diags: Diagnostics::new(),
        inherited: root,
        scope: None,
        warned_families: std::collections::HashSet::new(),
        warned_formats: std::collections::HashSet::new(),
        warned_row_conditions: std::collections::HashSet::new(),
        reflow_budget: crate::engine::flex::MAX_REFLOW_PLACEMENTS,
        reflow_exhausted: false,
        path: Vec::new(),
        page_margin: [0.0; 4],
        flow_text: false,
        ruby_anchors: Vec::new(),
        split_chrome: crate::engine::text::SplitChrome::default(),
    };
    let (page_width, page_height) = input.template.page.dimensions_pt();
    if input.template.page.orientation_ignored() {
        ctx.diags.push(Diagnostic::new(Code::OrientationIgnored));
    }
    // The margin box is the coordinate origin. `x` carries the left
    // margin into every basis-resolved item; the top margin is applied as
    // one whole-page translate at assembly (Basis stays y-less — vertical
    // placement is the walk's job).
    let margin = ctx.resolve_page_margin(page_width, page_height);
    ctx.page_margin = margin;
    let page_basis = Basis {
        x: margin[3],
        w: page_width - margin[3] - margin[1],
        h: Some(page_height - margin[0] - margin[2]),
        font: ctx.font_rel(),
        pct_w: None,
        fill_h: None,
    };

    // Document metadata resolves BEFORE the body walk, not after it: it is
    // document-scoped, and at this point `ctx.scope` is structurally None
    // rather than None-because-every-cell-walk-restored-it. Its diagnostics
    // are raised before any descent, which is what leaves them unlocated
    // (document scope) — see `enter_item`/`leave_item`.
    let metadata = ctx.document_metadata();

    let body_pages = match &input.template.sections.body {
        Body::Flow(flow) => ctx.layout_flow(flow, &page_basis),
        Body::Absolute(abs) => {
            let body_mark = ctx.enter_item("sections.body".to_string());
            let mut page = PageBuild::default();
            let visibility = ctx.child_visibility(&abs.items);
            for (i, item) in abs.items.iter().enumerate() {
                if visibility[i].is_collapsed() {
                    continue;
                }
                // Absolutely placed, so hiding and collapsing look the same
                // on the page; only the reported `PlacedBox` differs.
                let mark = (visibility[i] == Visibility::Hidden)
                    .then(|| visibility::draw_mark(std::slice::from_ref(&page)));
                let item_mark = ctx.enter_item(format!("items[{i}]"));
                ctx.place_absolute_item(item, &page_basis, &mut page);
                ctx.leave_item(item_mark);
                if let Some(mark) = mark {
                    visibility::blank_since(std::slice::from_mut(&mut page), &mark);
                }
            }
            ctx.leave_item(body_mark);
            vec![page]
        }
    };

    let total = body_pages.len();
    let mut pages = Vec::with_capacity(total);
    let mut box_pages = Vec::with_capacity(total);
    for (index, mut body_page) in body_pages.into_iter().enumerate() {
        let page_no = index + 1;
        let mut items = Vec::new();
        let mut boxes = Vec::new();
        if let Some(header) = &input.template.sections.header {
            let mut band = ctx.layout_band(header, "sections.header", page_no, total, &page_basis);
            items.append(&mut band.items);
            boxes.append(&mut band.boxes);
        }
        items.append(&mut body_page.items);
        boxes.append(&mut body_page.boxes);
        if let Some(footer) = &input.template.sections.footer {
            let mut band = ctx.layout_band(footer, "sections.footer", page_no, total, &page_basis);
            items.append(&mut band.items);
            boxes.append(&mut band.boxes);
        }
        // The walks work in margin-box y (top = 0); shift the assembled
        // page down by the top margin to reach sheet coordinates.
        let (items, boxes) = if margin[0] == 0.0 {
            (items, boxes)
        } else {
            (
                translate(&items, margin[0]),
                translate_boxes(&boxes, margin[0]),
            )
        };
        pages.push(LayoutPage { items });
        box_pages.push(boxes);
    }

    // The re-flow budget is reported here, after the whole walk, because
    // it is drained from inside a parked measure pass — where every
    // diagnostic is discarded — and it is a fact about the DOCUMENT, not
    // about the container that happened to ask for the placement that
    // ran out. Once, at document scope.
    if ctx.reflow_exhausted {
        ctx.diags.push(Diagnostic::new(Code::ReflowBudgetExhausted));
    }
    // Collapse `(code, path)` duplicates: a diagnostic re-emitted for one
    // item across the measure and render passes (hostile font metrics in
    // table cells) or a child width resolved twice by the row pre-pass and
    // the atom pass.
    ctx.diags.dedup();
    LayoutOutput {
        document: LayoutDocument {
            page_width,
            page_height,
            pages,
            metadata,
        },
        boxes: BoxIndex { pages: box_pages },
        margin,
        diagnostics: ctx.diags,
    }
}
