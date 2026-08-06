//! QR geometry and placement: module math, quiet zone, EC sizing,
//! cells/flow/bands/flex, and decoration.

use super::qr_rects;
use crate::common::*;

#[test]
fn v1_code_draws_merged_modules_inside_the_quiet_zone() {
    // "TEST1" fits a version-1 code (21 modules) at the default medium
    // level; with the 4-module quiet zone the square is 29 modules, so a
    // 58pt box gives exactly 2pt modules starting 8pt in.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: qr_code
        box: { x: 0, y: 0, w: 58, h: 58 }
        text: TEST1
"#,
        json!({}),
    );
    assert!(diags.items.is_empty(), "unexpected diagnostics: {diags:?}");
    let rects = qr_rects(&doc.pages[0]);
    assert!(!rects.is_empty());
    // Top-left finder row: 7 dark modules merged into ONE 14pt rect at
    // the quiet-zone origin (run-length merging at work).
    let first = rects[0];
    assert_eq!((first.x, first.y, first.w, first.h), (8.0, 8.0, 14.0, 2.0));
    // Every module stays inside the 21-module code square (quiet zone
    // empty): x in [8, 50], y in [8, 50].
    for r in &rects {
        assert!(r.x >= 8.0 - 0.01 && r.x + r.w <= 50.0 + 0.01, "x: {r:?}");
        assert!(r.y >= 8.0 - 0.01 && r.y + r.h <= 50.0 + 0.01, "y: {r:?}");
        assert!(r.stroke.is_none());
    }
}

#[test]
fn higher_error_correction_needs_more_smaller_modules() {
    // 20 alphanumeric chars: low fits version 1 (29 total modules →
    // 2pt), high needs version 2 (25 + 8 = 33 → ~1.76pt).
    let template = |level: &str| {
        format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: qr_code
        box: {{ x: 0, y: 0, w: 58, h: 58 }}
        text: HELLOHELLOHELLOHELLO
        errorCorrection: {level}
"#
        )
    };
    let (doc, _) = run(&template("low"), json!({}));
    let low_module = qr_rects(&doc.pages[0])[0].h;
    let (doc, _) = run(&template("high"), json!({}));
    let high_module = qr_rects(&doc.pages[0])[0].h;
    assert_eq!(low_module, 58.0 / 29.0);
    assert_eq!(high_module, 58.0 / 33.0);
}

#[test]
fn repeat_cells_encode_per_element_tokens() {
    // Two tickets, one code each, data-scoped to the element: both slots
    // get modules, and different tokens yield different patterns.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 100 }
    items:
      - type: repeat
        data: { key: tickets }
        grid: { columns: 2, rows: 1 }
        cell:
          items:
            - type: qr_code
              box: { x: 5, y: 5, w: 40, h: 40 }
              data: { key: token }
"#,
        json!({ "tickets": [{ "token": "AAAA0001" }, { "token": "ZZZZ9999" }] }),
    );
    assert!(diags.items.is_empty(), "unexpected diagnostics: {diags:?}");
    let rects = qr_rects(&doc.pages[0]);
    let left: Vec<_> = rects.iter().filter(|r| r.x < 50.0).collect();
    let right: Vec<_> = rects.iter().filter(|r| r.x >= 50.0).collect();
    assert!(!left.is_empty() && !right.is_empty());
    // Different content → different module runs (compare the run-width
    // multiset of one row band as a cheap pattern fingerprint).
    let sig = |rs: &[&&RectShape]| {
        let mut ws: Vec<i64> = rs.iter().map(|r| (r.w * 100.0) as i64).collect();
        ws.sort_unstable();
        ws
    };
    assert_ne!(sig(&left), sig(&right), "patterns must differ");
}

#[test]
fn decoration_paints_a_backing_under_the_modules() {
    // Box decoration: a white backgroundColor is the scannable backing.
    let (doc, _) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: qr_code
        box: { x: 0, y: 0, w: 58, h: 58 }
        text: TEST1
        style: { backgroundColor: "#ffffff" }
"##,
        json!({}),
    );
    let first = &doc.pages[0].items[0];
    let LayoutItem::Rect(backing) = first else { panic!("expected backing rect first") };
    assert_eq!(backing.fill, Some((1.0, 1.0, 1.0)));
    assert_eq!(
        (backing.x, backing.y, backing.w, backing.h),
        (0.0, 0.0, 58.0, 58.0)
    );
}

#[test]
fn qr_flows_and_stacks_like_any_flow_item() {
    // Flow arm: the code reserves its box height and the next item stacks
    // below it.
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 100, h: 200 }
    items:
      - type: qr_code
        box: { w: 58, h: 58 }
        text: TEST1
      - type: text
        text: next
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert!(!qr_rects(&doc.pages[0]).is_empty());
    assert_eq!(text_blocks(&doc.pages[0])[0].lines[0].y, 58.0);
}

#[test]
fn quartile_level_parses_and_encodes() {
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: qr_code
        box: { x: 0, y: 0, w: 58, h: 58 }
        text: TEST1
        errorCorrection: quartile
"#,
        json!({}),
    );
    assert!(!qr_rects(&doc.pages[0]).is_empty());
}

#[test]
fn qr_and_list_work_in_bands_and_as_flex_children() {
    // Band arms (a verification QR + a legend list in the footer) and the
    // flex child-walk arms (no x/y inside a container → flex placement).
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 100 }
        items:
          - type: qr_code
            box: { w: 58, h: 58 }
            text: TEST1
          - type: list
            box: { w: 100, h: 20 }
            data: { key: lines }
            style: { fontSize: 10, lineHeight: 1.0 }
  footer:
    height: 80
    items:
      - type: qr_code
        box: { x: 0, y: 760, w: 40, h: 40 }
        text: FOOT1
      - type: list
        box: { x: 50, y: 760, w: 100, h: 20 }
        data: { key: lines }
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "lines": ["a", "b"] }),
    );
    assert!(diags.items.is_empty(), "unexpected diagnostics: {diags:?}");
    // Body flex children: QR at the container top, list stacked below it.
    let rects = qr_rects(&doc.pages[0]);
    assert!(!rects.is_empty());
    // Footer band emitted its own QR modules (y in the footer region).
    assert!(rects.iter().any(|r| r.y > 700.0), "footer QR present");
    // Both lists rendered (body flex + footer band).
    let lists: Vec<_> = text_blocks(&doc.pages[0]);
    assert!(lists.len() >= 2);
}

#[test]
fn row_direction_plans_qr_and_list_side_by_side() {
    // `direction: row` pre-plans child bases from their authored boxes
    // (the FlexKind box_() path): the QR sits left, the list right of it.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 0, y: 0, w: 200, h: 80, direction: row }
        items:
          - type: qr_code
            box: { w: 58, h: 58 }
            text: TEST1
          - type: list
            box: { w: 100, h: 30 }
            data: { key: lines }
            style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "lines": ["a"] }),
    );
    assert!(diags.items.is_empty(), "unexpected diagnostics: {diags:?}");
    let rects = qr_rects(&doc.pages[0]);
    assert!(rects.iter().all(|r| r.x < 58.0), "QR in the left slot");
    let list_line = &text_blocks(&doc.pages[0])[0].lines[0];
    assert!(list_line.x >= 58.0, "list right of the QR: {list_line:?}");
}
