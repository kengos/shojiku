//! Hostile inputs to the measurement walk: nesting past the depth cap
//! from both sides, and a params-driven string long enough to demand
//! more width than any page has.

use super::probe;
use crate::common::*;

/// A row whose first child is `depth` containers nested one inside the
/// next, `flexBasis: content` at every level so the measurement walk has
/// to recurse the whole way down before anything is placed.
fn deep_row(depth: usize) -> (Vec<f64>, bool) {
    let mut inner = "- type: text\n  text: あいうえ".to_string();
    for _ in 0..depth {
        let indented: String = inner.lines().map(|l| format!("    {l}\n")).collect();
        inner = format!(
            "- type: container\n  box: {{ h: 20, flexBasis: content }}\n  style: {{ borderWidth: 1 }}\n  items:\n{indented}"
        );
        inner = inner.trim_end().to_string();
    }
    let yaml = format!(
        "page: {{ margin: 0 }}\ndefaults: {{ style: {{ fontFamily: biz-ud-gothic, fontSize: 10 }} }}\n\
         sections:\n  body:\n    type: absolute\n    items:\n      - type: container\n        box: {{ x: 0, y: 0, w: 200, h: 60, direction: row }}\n        items:\n{}",
        inner.lines().map(|l| format!("          {l}\n")).collect::<String>()
    );
    let (doc, diags) = run(&yaml, json!({}));
    let widths = rect_shapes(&doc.pages[0]).iter().map(|r| r.w).collect();
    (widths, diags.has_errors())
}

#[test]
fn a_container_nested_past_the_depth_cap_degrades_to_finite_widths() {
    // S1. `flexBasis: content` at every level of a hostile nesting means
    // the measurement walk recurses before a single box is placed —
    // `container_atom`'s own depth check runs at LAYOUT time, far too
    // late. So the walk carries its OWN bound.
    //
    // The widths are asserted NUMERICALLY, which is the whole point:
    // "renders without errors" is satisfied by NaN and by inf, and a
    // recursive width sum is exactly where those come from.
    let (widths, errored) = deep_row(MAX_CONTAINER_DEPTH);
    assert!(
        errored,
        "over-deep nesting is an error, not a silent render"
    );
    assert!(!widths.is_empty(), "the admitted levels still drew");
    for w in &widths {
        assert!(w.is_finite(), "non-finite width {w}");
        assert!((0.0..=200.0).contains(w), "width outside the row: {w}");
    }
}

#[test]
fn a_container_exactly_at_the_depth_cap_still_measures() {
    // S2, the boundary the clamp itself creates. One level shallower must
    // still be MEASURED and clean — a guard that fires a level early
    // silently changes the layout of legitimate deep templates, and no
    // other test would notice.
    // One less than the cap: the enclosing ROW is itself a container and
    // spends a level, so this is the deepest nesting the walk admits.
    let (widths, errored) = deep_row(MAX_CONTAINER_DEPTH - 1);
    assert!(!errored, "the deepest admitted nesting must render clean");
    // Every level wraps the same 40pt text, so every box measures 40 —
    // the recursion carried the content width all the way up.
    for w in &widths {
        assert_eq!(*w, 40.0, "measured content width at every level");
    }
}

#[test]
fn a_pathological_params_text_clamps_its_measured_width() {
    // S3. The content is params-driven, so its length is attacker-chosen:
    // a 200k-character single line measures to something far past any page
    // and must clamp at `MAX_RESOLVED_PT` rather than poisoning the row's
    // arithmetic. Numeric, and it must terminate.
    let long = "あ".repeat(200_000);
    let yaml = "page: { margin: 0 }\ndefaults: { style: { fontFamily: biz-ud-gothic, fontSize: 10 } }\n\
         sections:\n  body:\n    type: absolute\n    items:\n      - type: container\n        box: { x: 0, y: 0, w: 200, h: 40, direction: row }\n        items:\n\
         \x20         - type: text\n            box: { h: 20 }\n            style: { borderWidth: 1 }\n            data: { key: blob }\n";
    let (doc, _) = run(yaml, json!({ "blob": long }));
    assert_eq!(doc.pages.len(), 1);
    for r in rect_shapes(&doc.pages[0]) {
        assert!(r.w.is_finite(), "non-finite width {}", r.w);
        assert!(r.w <= 200.0, "shrunk back into the row, got {}", r.w);
    }
}

#[test]
fn a_rich_spans_text_has_no_intrinsic_width() {
    // A `spans` text carries a per-span style chain, so its width needs
    // the styled-char engine rather than one shaped run — measuring it as
    // a single run would report the first span's face for all of them.
    // `None`, and it falls back to a share.
    let r = probe(
        "- type: text\n  box: { h: 20 }\n  style: { borderWidth: 1 }\n  spans:\n    - { text: あい }\n    - { text: うえ, style: { fontWeight: bold } }",
    );
    assert_eq!(r[0].1, 95.0, "rich text took a share, not a measure");
}

#[test]
fn an_unmeasurable_child_is_skipped_by_its_containers_measure() {
    // A container sums the children it CAN measure. One that reports no
    // intrinsic width — a nested vertical block here — contributes
    // nothing rather than zeroing the sum or aborting it, so the
    // measurable siblings still decide the container's width.
    let r = probe(
        "- type: container\n  box: { h: 20, direction: row }\n  style: { borderWidth: 1 }\n  items:\n\
         \x20   - type: text\n      box: { h: 16 }\n      style: { writingMode: vertical_rl }\n      text: あいう\n    - type: text\n      text: あいうえ",
    );
    assert_eq!(r[0].1, 40.0, "the measurable sibling alone decides it");
}

#[test]
fn the_measure_walk_stops_before_the_layout_depth_check_does() {
    // The depth bound belongs to the RECURSION, not to the entry point:
    // `container_max_content` calls back into the dispatch for every
    // child, so a check made once on the way in would never be made
    // again. And `container_atom`'s own `MAX_CONTAINER_DEPTH` check runs
    // at LAYOUT time — it refuses the deep subtree only after this walk
    // has already descended the whole of it.
    //
    // A row whose child is a container chain past the cap is the shape
    // that reaches it: the row measures, and the measurement is what goes
    // deep.
    let (widths, _) = deep_row(MAX_CONTAINER_DEPTH + 8);
    for w in &widths {
        assert!(w.is_finite(), "non-finite width {w}");
        assert!((0.0..=200.0).contains(w), "width outside the row: {w}");
    }
}

#[test]
fn a_measured_container_reads_a_sized_child_and_a_checkbox() {
    // Inside a container being measured, an authored `w` IS the child's
    // width demand — no measurement needed — while a checkbox reports the
    // cap-height square it will draw. Both arms only exist on the
    // RECURSIVE path: at the top of a row the planner has already
    // resolved an authored `w`, and already reserved the checkbox its
    // square, so neither reaches the measurement from there.
    let r = probe(
        "- type: container\n  box: { h: 20, direction: row, gap: 0 }\n  style: { borderWidth: 1 }\n  items:\n\
         \x20   - type: text\n      box: { w: 25 }\n      text: あ\n    - type: checkbox\n      data: { key: on }",
    );
    // 25pt of authored width plus the cap square, which is under 12pt.
    assert!(
        r[0].1 > 25.0 && r[0].1 < 37.0,
        "authored width plus a cap square, got {}",
        r[0].1
    );
}
