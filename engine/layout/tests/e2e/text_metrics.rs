//! Inspect text-metrics surface (`src/engine/text/metrics.rs`): id-carrying
//! text items expose a per-line baseline + cap/em band on their placed
//! box, in page coordinates, so a GUI/AI can snap overlays without
//! re-measuring a preview.

use crate::common::*;
use shojiku_layout::PlacedBox;

fn only_box(out: &shojiku_layout::LayoutOutput) -> &PlacedBox {
    let boxes = &out.boxes.pages[0];
    assert_eq!(boxes.len(), 1, "one id-carrying item");
    &boxes[0]
}

#[test]
fn a_text_item_reports_its_line_baseline_and_bands() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 100, w: 400, h: 600 }
    items:
      - type: text
        id: label
        text: Hg
        style: { fontSize: 20, lineHeight: 1.0, fontFamily: biz-ud-gothic }
"#,
        json!({}),
    );
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    let metrics = only_box(&out).text.as_ref().expect("text metrics");
    let lines = metrics.lines().expect("horizontal lines");
    assert_eq!(lines.len(), 1);
    let l = lines[0];
    // y-down page coords: em_top ≤ cap_top < baseline < em_bottom, and the
    // baseline sits below the block top (y = 100).
    assert!(l.em_top <= l.cap_top, "{l:?}");
    assert!(l.cap_top < l.baseline, "{l:?}");
    assert!(l.baseline < l.em_bottom, "{l:?}");
    assert!(
        l.baseline > 100.0 && l.em_top >= 100.0 - 1e-6,
        "in-box: {l:?}"
    );
}

#[test]
fn metrics_track_each_wrapped_line() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    items:
      - type: text
        id: para
        box: { w: 30 }
        text: aaa bbb ccc
        style: { fontSize: 12, fontFamily: biz-ud-gothic }
"#,
        json!({}),
    );
    let metrics = only_box(&out).text.as_ref().expect("text metrics");
    let lines = metrics.lines().expect("horizontal lines");
    // The narrow box wraps into multiple lines, each with its own band,
    // stacked downward.
    assert!(lines.len() >= 2, "wrapped: {lines:?}");
    assert!(lines[1].baseline > lines[0].baseline);
}

#[test]
fn a_non_text_item_has_no_text_metrics() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    items:
      - type: rect
        style: { borderWidth: 1 }
        id: box
        box: { w: 40, h: 20 }
"#,
        json!({}),
    );
    assert!(only_box(&out).text.is_none());
}

/// An oversized flow text (`n` one-word paragraphs = `n` 10pt lines) in
/// an `h`-pt region, so it splits across pages at line boundaries.
fn split_template(n: usize, h: usize) -> String {
    let content = (1..=n)
        .map(|i| format!("L{i}"))
        .collect::<Vec<_>>()
        .join("\\n");
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 200, h: {h} }}
    items:
      - type: text
        id: para
        text: "{content}"
        style: {{ fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic }}
"#
    )
}

/// The `id`'d placement on one page of the box index.
fn page_box<'a>(out: &'a shojiku_layout::LayoutOutput, page: usize, id: &str) -> &'a PlacedBox {
    out.boxes.pages[page]
        .iter()
        .find(|b| b.id.as_deref() == Some(id))
        .expect("per-fragment placement")
}

#[test]
fn each_split_fragment_carries_its_own_line_metrics() {
    // 120 lines at 10pt in a 500pt region split 50 + 50 + 20; every
    // fragment's placement reports ITS drawn lines (pages 2+ used to
    // clone the whole block's stale per-line list).
    let out = run_full(&split_template(120, 500), json!({}));
    assert!(out.diagnostics.is_empty(), "{:?}", out.diagnostics);
    assert_eq!(out.boxes.pages.len(), 3);
    for (p, expect) in [(0usize, 50usize), (1, 50), (2, 20)] {
        let pb = page_box(&out, p, "para");
        let metrics = pb.text.as_ref().expect("fragment text metrics");
        let lines = metrics.lines().expect("horizontal lines");
        assert_eq!(lines.len(), expect, "page {p}");
        assert_eq!(
            lines.len(),
            text_blocks(&out.document.pages[p])[0].lines.len()
        );
        for (k, l) in lines.iter().enumerate() {
            // Baselines step by the 10pt leading and stay inside the
            // fragment's border box on THIS page.
            let step = lines[0].baseline + k as f64 * 10.0;
            assert!((l.baseline - step).abs() < 1e-6, "page {p} line {k}: {l:?}");
            let inside = l.baseline >= pb.border.y && l.baseline <= pb.border.y + pb.border.h;
            assert!(inside, "page {p} line {k}: {l:?} vs {:?}", pb.border);
        }
    }
}

#[test]
fn fragment_metrics_reanchor_at_each_pages_drawn_lines() {
    // (baseline − drawn line y) is the block's band offset, a per-block
    // constant — identical on every page once fragments rebuild their
    // metrics instead of cloning the whole block's.
    let out = run_full(&split_template(120, 500), json!({}));
    let mut offsets = Vec::new();
    for p in 0..3 {
        let drawn = text_blocks(&out.document.pages[p])[0];
        let metrics = page_box(&out, p, "para").text.as_ref().expect("metrics");
        let lines = metrics.lines().expect("horizontal lines");
        offsets.push(lines[0].baseline - drawn.lines[0].y);
    }
    assert!((offsets[1] - offsets[0]).abs() < 1e-6, "{offsets:?}");
    assert!((offsets[2] - offsets[0]).abs() < 1e-6, "{offsets:?}");
}

#[test]
fn a_split_rich_block_rebuilds_fragment_metrics() {
    // Latin `a` is 0.5em = 5pt in biz-ud-gothic: 40 chars hard-break to
    // 2-char lines in a 10pt box, and the 60pt region splits them —
    // the rich path shares the fragment rebuild.
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 60 }
    items:
      - type: text
        id: rich
        box: { w: 10 }
        style: { fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0 }
        spans:
          - text: "aaaaaaaaaaaaaaaaaaaa"
          - text: "aaaaaaaaaaaaaaaaaaaa"
"#,
        json!({}),
    );
    assert!(out.boxes.pages.len() >= 2, "splits");
    for p in 0..out.boxes.pages.len() {
        let drawn = text_blocks(&out.document.pages[p])[0];
        let metrics = page_box(&out, p, "rich").text.as_ref().expect("metrics");
        let lines = metrics.lines().expect("horizontal lines");
        assert_eq!(lines.len(), drawn.lines.len(), "page {p}");
    }
}

#[test]
fn an_idd_vertical_item_exposes_per_column_metrics() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        id: v
        text: "あいう"
        box: { w: 200, h: 100 }
        style: { fontSize: 10, fontFamily: biz-ud-gothic, writingMode: vertical_rl }
"#,
        json!({}),
    );
    let pb = out.boxes.pages[0]
        .iter()
        .find(|b| b.id.as_deref() == Some("v"))
        .expect("box index carries the id'd vertical item");
    // A vertical block exposes per-COLUMN metrics: the column axis
    // (baseline x) centered in the column band, the em band half a font
    // size to each side, and y/height the drawn extent.
    let metrics = pb.text.as_ref().expect("vertical column metrics");
    let cols = metrics.columns().expect("columns, not lines");
    assert_eq!(cols.len(), 1);
    let c = cols[0];
    // fontSize 10, default lineHeight: the axis sits half a column band
    // left of the content right edge (x=200), em band = axis ± 5.
    assert!((c.em_right - c.em_left - 10.0).abs() < 1e-6, "{c:?}");
    assert!((c.baseline - (c.em_left + 5.0)).abs() < 1e-6, "{c:?}");
    assert!(c.baseline < 200.0 && c.baseline > 150.0, "{c:?}");
    assert!(c.y >= -1e-9, "{c:?}");
    assert!(c.height > 0.0, "{c:?}");
    assert!(metrics.lines().is_none());
}
