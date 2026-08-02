//! Reserved height on pagination fragments: a `minHeight` taller than
//! the text leaves slack that `verticalAlign` distributes, and the
//! fragments carry it — the leading slack on the first, the trailing
//! slack on the last. Fragments used to re-derive every line y from
//! their own top, which dropped the offset AND the reservation (the
//! split output was simply the text's own height).

use crate::common::*;

/// A `minHeight`-reserved 60-line flow text (600pt of lines) in a 500pt
/// region, aligned by `valign`. `id` makes the per-fragment placements
/// readable through the box index.
fn reserved(min_h: &str, valign: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 200, h: 500 }}
    items:
      - type: text
        id: agreement
        text: "{}"
        box: {{ minHeight: {min_h} }}
        style: {{ fontSize: 10, lineHeight: 1.0, verticalAlign: {valign} }}
"#,
        super::numbered_lines(60)
    )
}

/// `(first line y, line count)` per page.
fn per_page(doc: &LayoutDocument) -> Vec<(f64, usize)> {
    doc.pages
        .iter()
        .map(|p| {
            let b = text_blocks(p)[0];
            (b.lines[0].y, b.lines.len())
        })
        .collect()
}

#[test]
fn bottom_alignment_leads_the_first_fragment_with_the_slack() {
    // 900pt reserved for 600pt of text: 300pt of slack, all of it above
    // the content. The first fragment starts its lines 300pt down and so
    // holds 20 of them; the rest continue at the region top.
    let (doc, diags) = run(&reserved("900", "bottom"), json!({}));
    assert!(diags.items.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(per_page(&doc), vec![(300.0, 20), (0.0, 40)]);
}

#[test]
fn middle_alignment_splits_the_slack_across_the_ends() {
    // 150pt above the content and 150pt below it.
    let (doc, _) = run(&reserved("900", "middle"), json!({}));
    assert_eq!(per_page(&doc), vec![(150.0, 35), (0.0, 25)]);
}

#[test]
fn top_alignment_keeps_the_lines_put_and_trails_the_slack() {
    // The whole 300pt sits below the content, so the line ys are exactly
    // the ones an unreserved block produces.
    let (doc, _) = run(&reserved("900", "top"), json!({}));
    assert_eq!(per_page(&doc), vec![(0.0, 50), (0.0, 10)]);
}

#[test]
fn the_fragments_reserve_the_authored_height_between_them() {
    // The box index is where the reservation is observable: the fragment
    // heights sum to the authored `minHeight` under every alignment
    // (top trails 300pt onto the last fragment, bottom leads with it).
    for (valign, expected) in [
        ("top", vec![500.0, 400.0]),
        ("middle", vec![500.0, 400.0]),
        ("bottom", vec![500.0, 400.0]),
    ] {
        let out = run_full(&reserved("900", valign), json!({}));
        let heights: Vec<f64> = out
            .boxes
            .pages
            .iter()
            .map(|page| page[0].border.h)
            .collect();
        assert_eq!(heights, expected, "{valign}");
        assert_eq!(heights.iter().sum::<f64>(), 900.0, "{valign}");
    }
}

#[test]
fn zero_slack_leaves_the_pre_slack_arithmetic_untouched() {
    // Nothing reserved = nothing to distribute, so the alignment cannot
    // move anything and every number is the one an unreserved block
    // produces (which the rest of this suite pins).
    let (doc, _) = run(&reserved("0", "bottom"), json!({}));
    assert_eq!(per_page(&doc), vec![(0.0, 50), (0.0, 10)]);
}

#[test]
fn slack_far_larger_than_the_region_still_terminates() {
    // 1,000,000pt reserved (the resolved-length cap) for 600pt of text,
    // trailing: the last fragment is far taller than a page, which the
    // existing overflow warning reports rather than looping. Decorated,
    // so the redrawn box is checked for finiteness too — the fragment
    // height is what sizes it.
    let bordered = reserved("1000000", "top").replace(
        "verticalAlign: top }",
        "verticalAlign: top, borderWidth: { top: 2, bottom: 4 } }",
    );
    let (doc, diags) = run(&bordered, json!({}));
    assert_eq!(doc.pages.len(), 2);
    assert!(diags.iter().any(|d| d.code == "section_overflow"));
    // Nothing non-finite reaches the tree, in the lines or the box.
    for page in &doc.pages {
        assert!(text_blocks(page)[0].lines.iter().all(|l| l.y.is_finite()));
        let bands = rect_shapes(page);
        assert_eq!(bands.len(), 2);
        assert!(bands.iter().all(|r| r.y.is_finite() && r.h.is_finite()));
    }
    // The trailing slack lands on the last fragment's bottom band.
    let last = rect_shapes(doc.pages.last().expect("a last page"));
    assert_eq!(last[1].y, MAX_RESOLVED_PT - 500.0 - 2.0);
}

#[test]
fn leading_slack_larger_than_the_region_still_advances() {
    // The pathological shape: the leading slack alone exceeds the page,
    // so no line can fit under it. The fragment takes its one-line floor
    // and the loop advances — a single page, warned, never a spin.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 500 }
    items:
      - type: text
        text: "A"
        box: { minHeight: 900000 }
        style: { fontSize: 10, lineHeight: 1.0, verticalAlign: bottom }
"#,
        json!({}),
    );
    assert_eq!(doc.pages.len(), 1);
    assert!(diags.iter().any(|d| d.code == "section_overflow"));
    assert_eq!(text_blocks(&doc.pages[0])[0].lines[0].y, 899990.0);
}

#[test]
fn decoration_follows_the_reserved_fragment_heights() {
    // The two halves of the fix meet here: the redrawn box must be sized
    // to the fragment the slack produced, not to its lines.
    let (doc, _) = run(
        &format!(
            r##"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 200, h: 500 }}
    items:
      - type: text
        text: "{}"
        box: {{ minHeight: 900 }}
        style:
          fontSize: 10
          lineHeight: 1.0
          verticalAlign: bottom
          borderWidth: {{ top: 2, bottom: 4 }}
"##,
            super::numbered_lines(60)
        ),
        json!({}),
    );
    for (page, h) in doc.pages.iter().zip([500.0, 400.0]) {
        let bands = rect_shapes(page);
        assert_eq!(bands.len(), 2);
        assert_eq!(bands[0].y, -1.0);
        assert_eq!(bands[1].y, h - 2.0, "the bottom band on the fragment edge");
    }
}
