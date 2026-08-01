//! Flex cross-cutting: the absolute escape hatch, flow auto margins,
//! repeat cells, the box index, and hostile-input degradations.

use super::*;

#[test]
fn absolute_children_keep_phase1_positions_next_to_flex_siblings() {
    let mixed = "- type: rect\n  style: { borderWidth: 1 }\n  box: { x: 20, y: 40, w: 50, h: 10 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 200, h: 20 }\n- type: rect\n  style: { borderWidth: 1 }\n  box: { w: 200, h: 20 }";
    let yaml = container_body("{ x: 0, y: 0, w: 200, h: 100, gap: 10 }", mixed);
    let (doc, diags) = run(&yaml, json!({}));
    assert!(!diags.has_errors());
    let rects = rect_shapes(&doc.pages[0]);
    // Paint order stays document order: the absolute rect first.
    assert_eq!((rects[0].x, rects[0].y), (20.0, 40.0));
    // Flex siblings stack from the top, unaffected by the absolute one.
    assert_eq!((rects[1].y, rects[2].y), (0.0, 30.0));
}

#[test]
fn flow_items_honor_horizontal_auto_margins() {
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 300 }
    items:
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 100, h: 20, margin: { left: auto } }
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 100, h: 20, margin: { left: auto, right: auto } }
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 100, h: 20, margin: { right: auto } }
"#;
    let (doc, diags) = run(yaml, json!({}));
    assert!(!diags.has_errors());
    let xs: Vec<f64> = rect_shapes(&doc.pages[0]).iter().map(|r| r.x).collect();
    assert_eq!(xs, vec![100.0, 50.0, 0.0]);
}

#[test]
fn repeat_cells_flex_their_children_within_the_slot() {
    let yaml = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 100 }
    items:
      - type: repeat
        data: { key: cards }
        grid: { columns: 1, rows: 1 }
        cell:
          box: { justifyContent: center }
          items:
            - type: rect
              style: { borderWidth: 1 }
              box: { w: 200, h: 20 }
"#;
    let (doc, diags) = run(yaml, json!({ "cards": [{}] }));
    assert!(!diags.has_errors(), "{diags:?}");
    // Slot = the full 100pt region; free 80 → the rect centers at 40.
    assert_eq!(rect_shapes(&doc.pages[0])[0].y, 40.0);
}

#[test]
fn flex_placement_shifts_the_box_index_too() {
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, h: 100, justifyContent: end, alignItems: end }",
        "- id: badge\n  type: rect\n  box: { w: 100, h: 20 }",
    );
    let out = run_full(&yaml, json!({}));
    let placed = &out.boxes.pages[0];
    let badge = placed
        .iter()
        .find(|b| b.id.as_deref() == Some("badge"))
        .expect("badge box");
    assert_eq!((badge.border.x, badge.border.y), (100.0, 80.0));
}

#[test]
fn hostile_gap_values_degrade_with_diagnostics() {
    // `%` gap against an auto-height container: dropped with a warning.
    let pct = container_body("{ x: 0, y: 0, w: 200, gap: \"10%\" }", TWO_RECTS);
    let (doc, diags) = run(&pct, json!({}));
    assert!(
        diags.iter().any(|d| d.code == "percent_of_auto"),
        "{diags:?}"
    );
    let ys: Vec<f64> = rect_shapes(&doc.pages[0]).iter().map(|r| r.y).collect();
    assert_eq!(ys, vec![0.0, 20.0]);
    // An out-of-range gap is dropped (cap diagnostic), not propagated.
    let huge = container_body("{ x: 0, y: 0, w: 200, h: 100, gap: 2000000 }", TWO_RECTS);
    let (doc, diags) = run(&huge, json!({}));
    assert!(diags.iter().any(|d| d.code == "length_out_of_range"));
    let ys: Vec<f64> = rect_shapes(&doc.pages[0]).iter().map(|r| r.y).collect();
    assert_eq!(ys, vec![0.0, 20.0]);
    // A negative gap clamps to 0 (CSS: invalid → ignored).
    let negative = container_body("{ x: 0, y: 0, w: 200, h: 100, gap: -50 }", TWO_RECTS);
    assert_eq!(rect_ys(&negative), vec![0.0, 20.0]);
}

#[test]
fn overfull_flex_content_still_warns_container_overflow() {
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, h: 30, justifyContent: center }",
        TWO_RECTS,
    );
    let (_, diags) = run(&yaml, json!({}));
    assert!(
        diags.iter().any(|d| d.code == "container_overflow"),
        "{diags:?}"
    );
}
