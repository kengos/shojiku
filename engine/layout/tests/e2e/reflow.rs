//! The re-flow placement budget: what spends it, what must never spend
//! it, and the runaway it exists to stop.
//!
//! Three features place a child a SECOND time — an auto-height `stretch`
//! row, a `flexGrow` column, and a grid whose `fr` rows have to wait for
//! an auto row to be measured. Each of them re-places a CONTAINER's
//! children, so nesting compounds the cost per level. The budget is the
//! same shape of guard `MAX_PAGES` is: a backstop no ordinary document
//! approaches, whose degradation is benign — the children keep the size
//! they had before the feature existed.

use crate::common::*;
use crate::flex::container_body;

fn diags_of(yaml: &str) -> Vec<String> {
    let (_, diags) = run(yaml, json!({}));
    diags.iter().map(|d| d.code.to_string()).collect()
}

#[test]
fn an_ordinary_document_never_approaches_the_budget() {
    // T23, the load-bearing half. The budget counts PLACEMENTS, and a row
    // that asks for no second look spends none of them — so a document
    // with far more flex children than the budget has placements must
    // still come back clean.
    //
    // Without this, "the budget is a backstop, not a limit authors hit"
    // is an assertion in a comment rather than a property.
    let child = "- type: container\n  box: { h: 6 }\n  items:\n    - type: text\n      text: x";
    let rows: String = (0..400)
        .map(|_| {
            format!(
                "- type: container\n  box: {{ h: 8, direction: row, gap: 2 }}\n  items:\n{}\n",
                [child, child, child, child, child]
                    .map(|c| c.lines().map(|l| format!("    {l}\n")).collect::<String>())
                    .concat()
                    .trim_end()
            )
        })
        .collect();
    let yaml = container_body("{ x: 0, y: 0, w: 400, h: 4000 }", &rows);
    assert!(
        !diags_of(&yaml).contains(&"reflow_budget_exhausted".to_string()),
        "2000 ordinary flex children spent budget they never asked for"
    );
}

#[test]
fn a_definite_height_stretch_row_spends_nothing() {
    // T23's discriminating pair, and the reason `stretch` being the
    // DEFAULT `alignItems` is affordable at all: a row whose cross size
    // is already known needs no measurement, so the common case costs
    // exactly zero. Only the AUTO-height variant has to look twice.
    let child = "- type: container\n  box: { h: 6 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: x";
    let rows: String = (0..400)
        .map(|_| {
            format!(
                "- type: container\n  box: {{ h: 20, direction: row }}\n  items:\n{}\n",
                [child, child]
                    .map(|c| c.lines().map(|l| format!("    {l}\n")).collect::<String>())
                    .concat()
                    .trim_end()
            )
        })
        .collect();
    let yaml = container_body("{ x: 0, y: 0, w: 400, h: 9000 }", &rows);
    assert!(!diags_of(&yaml).contains(&"reflow_budget_exhausted".to_string()));
}

/// `depth` grids nested one inside the next, every one of them
/// `rows: ["auto", "1fr"]` over a definite height — so every level owes a
/// measurement pass whose single cell is itself a grid owing one.
///
/// The template grows LINEARLY with depth; the placements do not. Each
/// level is laid out twice (once parked to measure the auto row, once
/// for real), and both copies descend, so the cost is `2^depth` from a
/// fixture of `depth` lines.
fn nested_fr_grids(depth: usize) -> String {
    let mut inner =
        "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 4 }".to_string();
    for _ in 0..depth {
        let indented: String = inner.lines().map(|l| format!("    {l}\n")).collect();
        inner = format!(
            "- type: container\n  box: {{ h: 60, type: grid, columns: 1, rows: [\"auto\", \"1fr\"] }}\n  items:\n{}",
            indented.trim_end()
        );
    }
    inner
}

#[test]
fn nested_fr_over_auto_grids_stop_at_the_budget_and_still_terminate() {
    // S7 — the plan called this the most important hostile case in the
    // cycle, and it is the one the measurement design does NOT already
    // prevent. A grid whose cells are grids, every row an `fr` over an
    // auto row, doubles its placements per level: the measure pass at one
    // level lays out cells that each run their own measure pass, and the
    // real pass runs them all again. That is `2^depth`.
    //
    // The budget has to stop it, say so, and let the render finish. A
    // guard that merely made it slower would be no guard at all, so the
    // assertion is on all three: the diagnostic fires, the document is
    // produced, and the widths that come out are real numbers.
    let yaml = container_body(
        "{ x: 0, y: 0, w: 300, h: 500 }",
        &nested_fr_grids(MAX_CONTAINER_DEPTH - 2),
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert!(
        diags.iter().any(|d| d.code == "reflow_budget_exhausted"),
        "the runaway was not stopped: {diags:?}"
    );
    assert!(!doc.pages.is_empty(), "the render must still finish");
    for r in rect_shapes(&doc.pages[0]) {
        assert!(r.w.is_finite() && r.h.is_finite(), "non-finite box {r:?}");
    }
}

#[test]
fn the_budget_is_reported_once_however_often_it_is_hit() {
    // Refusing is a single fact about the document, not a per-container
    // event: a runaway hits the exhausted branch on every level below the
    // one that drained it, and repeating the warning that many times
    // would bury everything else the author needs to read.
    let yaml = container_body(
        "{ x: 0, y: 0, w: 300, h: 500 }",
        &nested_fr_grids(MAX_CONTAINER_DEPTH - 2),
    );
    let (_, diags) = run(&yaml, json!({}));
    let n = diags
        .iter()
        .filter(|d| d.code == "reflow_budget_exhausted")
        .count();
    assert_eq!(n, 1, "reported {n} times: {diags:?}");
}

#[test]
fn an_exhausted_budget_leaves_later_boxes_at_their_content_size() {
    // The refusal path of the other two spenders. Once the runaway has
    // drained the budget, a `flexGrow` column and an auto-height stretch
    // row further down the document are refused their second placement —
    // and the degradation has to be the benign one the budget promises:
    // the children keep the size they had before either feature existed,
    // rather than a half-applied one.
    //
    // Asserted against the SAME fixtures laid out on their own, which is
    // what makes this a refusal rather than a coincidence.
    let grower = "- type: container\n  box: { h: 60 }\n  items:\n\
                  \x20   - type: container\n      box: { flexGrow: 1 }\n      style: { borderWidth: 1 }\n      items:\n        - { type: text, text: g }\n\
                  \x20   - type: container\n      box: { h: 20 }\n      style: { borderWidth: 1 }\n      items:\n        - { type: text, text: h }";
    let alone = container_body("{ x: 0, y: 0, w: 300, h: 200 }", grower);
    let (doc, _) = run(&alone, json!({}));
    let grown = rect_shapes(&doc.pages[0])[0].h;
    assert_eq!(grown, 40.0, "the control: it grows when it can");

    let starved = container_body(
        "{ x: 0, y: 0, w: 300, h: 700 }",
        &format!("{}\n{grower}", nested_fr_grids(MAX_CONTAINER_DEPTH - 2)),
    );
    let (doc, diags) = run(&starved, json!({}));
    assert!(diags.iter().any(|d| d.code == "reflow_budget_exhausted"));
    let after = rect_shapes(&doc.pages[0]);
    let refused = after
        .iter()
        .find(|r| r.h > 0.0 && r.h < 40.0 && r.w > 250.0)
        .map(|r| r.h);
    assert!(
        refused.is_some_and(|h| h < grown),
        "the column kept its content height, got {refused:?} against {grown}"
    );
}

#[test]
fn an_exhausted_budget_leaves_an_auto_height_row_unstretched() {
    // The third spender's refusal path. An AUTO-height `stretch` row has
    // to discover its cross size from its tallest child before it can
    // hand it down; refused that placement, it hands down nothing and the
    // shorter child keeps its own height — which is exactly what the row
    // did before stretch existed, and is why the degradation is safe to
    // take silently at the point of refusal.
    let row = "- type: container\n  box: { direction: row }\n  items:\n\
               \x20   - type: container\n      box: { flexBasis: 0 }\n      style: { borderWidth: 1 }\n      items:\n        - { type: text, text: one }\n\
               \x20   - type: container\n      box: { flexBasis: 0 }\n      style: { borderWidth: 1 }\n      items:\n        - { type: text, text: \"a\\nb\\nc\" }";
    let heights = |yaml: &str| -> Vec<f64> {
        let (doc, _) = run(yaml, json!({}));
        rect_shapes(&doc.pages[0]).iter().map(|r| r.h).collect()
    };
    // The control: with budget to spend, the short child fills the row.
    let alone = heights(&container_body("{ x: 0, y: 0, w: 300 }", row));
    assert_eq!(alone[0], alone[1], "the control must stretch");

    let starved = heights(&container_body(
        "{ x: 0, y: 0, w: 300, h: 700 }",
        &format!("{}\n{row}", nested_fr_grids(MAX_CONTAINER_DEPTH - 2)),
    ));
    let short = starved.iter().copied().fold(f64::MAX, f64::min);
    let tall = starved.iter().copied().fold(0.0_f64, f64::max);
    assert!(
        short < tall,
        "refused the stretch, so the children keep their own heights"
    );
}
