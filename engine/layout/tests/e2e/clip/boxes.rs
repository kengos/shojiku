//! `overflow: hidden` on container-like boxes: clip-node geometry,
//! warning suppression, nesting, flow/flex translation, and the
//! repeat-cell / repeat_flow-card paths.

use super::{clip_shapes, only_clip};
use crate::common::*;
use shojiku_layout::LayoutItem;

#[test]
fn hidden_container_wraps_children_in_a_border_box_clip() {
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: container
        box: { h: 100 }
        style: { overflow: hidden, backgroundColor: "#eeeeee" }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { w: 50, h: 150 }
"##,
        json!({}),
    );
    // Opting into clipping suppresses the overflow warning.
    assert!(diags.is_empty(), "diags: {diags:?}");
    let clip = only_clip(&doc.pages[0]);
    assert_eq!((clip.x, clip.y, clip.w, clip.h), (0.0, 0.0, 400.0, 100.0));
    // The overflowing child lives inside the clip …
    assert!(
        matches!(&clip.items[0], LayoutItem::Rect(r) if r.h == 150.0),
        "child rect inside the clip: {:?}",
        clip.items
    );
    // … while the container's own decoration stays outside it.
    assert!(
        rect_shapes(&doc.pages[0]).iter().any(|r| r.fill.is_some()),
        "decoration outside the clip"
    );
}

#[test]
fn visible_overflow_keeps_the_warning_and_emits_no_clip() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: container
        box: { h: 100 }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { w: 50, h: 150 }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "container_overflow"));
    assert!(clip_shapes(&doc.pages[0]).is_empty());
}

#[test]
fn clip_rect_follows_the_flow_cursor() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: text
        text: intro
        style: { fontSize: 10, lineHeight: 1.0 }
      - type: container
        box: { h: 100 }
        style: { overflow: hidden }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { w: 50, h: 150 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    // translate() must shift the clip rect and its children together.
    let clip = only_clip(&doc.pages[0]);
    assert_eq!(clip.y, 10.0);
    assert!(matches!(&clip.items[0], LayoutItem::Rect(r) if r.y == 10.0));
}

#[test]
fn nested_hidden_containers_nest_clip_nodes() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: container
        box: { h: 100 }
        style: { overflow: hidden }
        items:
          - type: container
            box: { x: 10, y: 20, w: 200, h: 50 }
            style: { overflow: hidden }
            items:
              - type: rect
                style: { borderWidth: 1 }
                box: { w: 300, h: 80 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    let outer = only_clip(&doc.pages[0]);
    assert_eq!((outer.w, outer.h), (400.0, 100.0));
    let inner = match &outer.items[0] {
        LayoutItem::Clip(c) => c,
        other => panic!("expected nested clip, got {other:?}"),
    };
    assert_eq!(
        (inner.x, inner.y, inner.w, inner.h),
        (10.0, 20.0, 200.0, 50.0)
    );
    assert!(matches!(&inner.items[0], LayoutItem::Rect(r) if r.w == 300.0));
}

#[test]
fn auto_height_hidden_container_still_clips_horizontally() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: container
        box: { w: 200 }
        style: { overflow: hidden }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { w: 600, h: 30 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    let clip = only_clip(&doc.pages[0]);
    // Auto height grew to the content; width stays the authored 200 so
    // the 600pt child is cut horizontally.
    assert_eq!((clip.w, clip.h), (200.0, 30.0));
}

#[test]
fn auto_margin_centering_shifts_the_clip_rect_too() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: container
        box: { w: 200, h: 50, margin: { left: auto, right: auto } }
        style: { overflow: hidden }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { w: 300, h: 30 }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    // translate_x() must shift the clip rect with its children.
    let clip = only_clip(&doc.pages[0]);
    assert_eq!(clip.x, 100.0);
    assert!(matches!(&clip.items[0], LayoutItem::Rect(r) if r.x == 100.0));
}

#[test]
fn hidden_repeat_cell_clips_to_the_slot_box() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat
        data: { key: cells }
        grid: { columns: 2, rows: 1 }
        cell:
          style: { overflow: hidden }
          items:
            - type: rect
              style: { borderWidth: 1 }
              box: { w: 300, h: 500 }
"#,
        json!({ "cells": [{}] }),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    let clip = only_clip(&doc.pages[0]);
    // The cell fills its 200x400 grid slot.
    assert_eq!((clip.x, clip.y, clip.w, clip.h), (0.0, 0.0, 200.0, 400.0));
}

#[test]
fn hidden_repeat_flow_card_clips_at_the_cursor() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: repeat_flow
        data: { key: cards }
        item:
          box: { h: 40 }
          style: { overflow: hidden }
          items:
            - type: rect
              style: { borderWidth: 1 }
              box: { w: 50, h: 100 }
"#,
        json!({ "cards": [{}, {}] }),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    let clips = clip_shapes(&doc.pages[0]);
    assert_eq!(clips.len(), 2, "one clip per card");
    assert_eq!(clips[0].y, 0.0);
    assert_eq!(clips[1].y, 40.0);
    assert_eq!((clips[0].w, clips[0].h), (400.0, 40.0));
}

#[test]
fn hidden_container_keeps_its_box_index_entry() {
    let out = run_full(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: container
        id: card
        box: { h: 100 }
        style: { overflow: hidden }
        items:
          - type: rect
            style: { borderWidth: 1 }
            box: { w: 50, h: 150 }
"#,
        json!({}),
    );
    assert!(out.diagnostics.is_empty(), "diags: {:?}", out.diagnostics);
    let placed = out.boxes.pages[0]
        .iter()
        .find(|b| b.id.as_deref() == Some("card"))
        .expect("box index entry");
    assert_eq!(placed.border.h, 100.0);
}
