//! Link annotations (LK1): walks a laid-out page and emits one krilla
//! link annotation per linked run/line rect (text) or draw box (image).
//! Layout already resolved and gated every URL — this walk only maps
//! geometry the renderer draws anyway; a rect krilla cannot represent
//! (non-finite/degenerate) emits nothing (fail closed).

use krilla::action::{Action, LinkAction};
use krilla::annotation::{Annotation, LinkAnnotation, Target};
use krilla::geom::Rect;
use shojiku_layout::{LayoutItem, TextBlock, MAX_CLIP_DEPTH};

/// Collects the page's link annotations, recursing into clip groups with
/// the same depth cap and degenerate-rect guard as drawing — content that
/// draws as nothing must not stay clickable.
pub(crate) fn collect_annotations(
    items: &[LayoutItem],
    clip_depth: usize,
    out: &mut Vec<Annotation>,
) {
    for item in items {
        match item {
            LayoutItem::Clip(clip) => {
                if clip_depth >= MAX_CLIP_DEPTH
                    || !(clip.w.is_finite() && clip.w > 0.0 && clip.h.is_finite() && clip.h > 0.0)
                {
                    continue;
                }
                collect_annotations(&clip.items, clip_depth + 1, out);
            }
            LayoutItem::Text(block) => text_annotations(block, out),
            LayoutItem::Image(shape) => {
                if let Some(url) = &shape.link {
                    push_link(shape.x, shape.y, shape.w, shape.h, url, out);
                }
            }
            // Shapes carry no links (a mark is not a hyperlink target).
            LayoutItem::Rect(_) | LayoutItem::Line(_) | LayoutItem::Path(_) => {}
        }
    }
}

/// One annotation per linked run: `line_runs` folds the plain-block link
/// into the implicit run, so plain and rich blocks map through one path.
fn text_annotations(block: &TextBlock, out: &mut Vec<Annotation>) {
    // Fast path: the common linkless block allocates no run views.
    let linkless = block.link.is_none()
        && block
            .lines
            .iter()
            .all(|line| line.runs.iter().all(|run| run.link.is_none()));
    if linkless {
        return;
    }
    if block.vertical.is_some() {
        vertical_annotations(block, out);
        return;
    }
    for line in &block.lines {
        for run in block.line_runs(line) {
            if let Some(url) = run.link {
                push_link(run.x, line.y, run.width, block.line_height, url, out);
            }
        }
    }
}

/// Vertical annotations: a COLUMN's axes swap, so the clickable rect is
/// `line_height` wide (cross axis) and `width` tall (down the page). A
/// plain column links its whole extent from the column top; a rich column
/// links each run at its own down-offset (`run.x` = offset from the column
/// top, `run.width` = run down-extent) — never a square at the top.
fn vertical_annotations(block: &TextBlock, out: &mut Vec<Annotation>) {
    let col_w = block.line_height;
    for line in &block.lines {
        if line.runs.is_empty() {
            if let Some(url) = &block.link {
                push_link(line.x, line.y, col_w, line.width, url, out);
            }
        } else {
            for run in &line.runs {
                if let Some(url) = &run.link {
                    push_link(line.x, line.y + run.x, col_w, run.width, url, out);
                }
            }
        }
    }
}

/// Maps one activation rect to a borderless URI-action annotation.
/// krilla shares the layout tree's coordinate system (pt, top-left,
/// y-down) and flips to PDF coordinates itself at serialization.
fn push_link(x: f64, y: f64, w: f64, h: f64, url: &str, out: &mut Vec<Annotation>) {
    // krilla accepts zero-sized rects; gate them (and non-finite input)
    // here so a hostile tree cannot mint pointless/undefined annotations.
    if !(x.is_finite() && y.is_finite() && w.is_finite() && w > 0.0 && h.is_finite() && h > 0.0) {
        return;
    }
    // Second layer: values finite in f64 can still overflow the f32 cast.
    let Some(rect) = Rect::from_xywh(x as f32, y as f32, w as f32, h as f32) else {
        return;
    };
    let target = Target::Action(Action::Link(LinkAction::new(url.to_string())));
    out.push(LinkAnnotation::new(rect, target).into());
}

#[cfg(test)]
mod tests;
