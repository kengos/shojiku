//! Flow-repeat guards: data errors, hostile gaps, unsupported
//! placements, and the in-card restrictions shared with repeat cells.

use crate::common::*;

fn card_list_body(items_yaml: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 400 }}
    items:
{items_yaml}"#
    )
}

#[test]
fn repeat_flow_missing_data_warns_and_places_nothing() {
    let (doc, diags) = run(
        &card_list_body(
            r#"      - type: repeat_flow
        data: { key: ghost }
        item:
          items: []
"#,
        ),
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "missing_data"));
    assert!(doc.pages[0].items.is_empty());
}

#[test]
fn repeat_flow_non_array_data_errors_and_skips() {
    let (doc, diags) = run(
        &card_list_body(
            r#"      - type: repeat_flow
        data: { key: cards }
        item:
          items: []
"#,
        ),
        json!({ "cards": "oops" }),
    );
    assert!(diags.iter().any(|d| d.code == "not_an_array"));
    assert!(doc.pages[0].items.is_empty());
}

#[test]
fn repeat_flow_empty_array_places_nothing_without_warning() {
    let (doc, diags) = run(
        &card_list_body(
            r#"      - type: repeat_flow
        data: { key: cards }
        item:
          items: []
"#,
        ),
        json!({ "cards": [] }),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    assert!(doc.pages[0].items.is_empty());
}

#[test]
fn repeat_flow_negative_gap_clamps_to_zero() {
    let (doc, diags) = run(
        &card_list_body(
            r#"      - type: repeat_flow
        data: { key: cards }
        gap: -20
        item:
          box: { h: 30 }
          items:
            - type: text
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        ),
        json!({ "cards": [{"label": "A"}, {"label": "B"}] }),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    // The hostile gap cannot pull B back over A: cards touch instead.
    assert_eq!(cell_pos(&doc.pages[0], "B"), (0.0, 30.0));
}

#[test]
fn repeat_flow_huge_gap_is_guarded_not_fatal() {
    let (doc, diags) = run(
        &card_list_body(
            r#"      - type: repeat_flow
        data: { key: cards }
        gap: 1000000000000
        item:
          box: { h: 30 }
          items:
            - type: text
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        ),
        json!({ "cards": [{"label": "A"}, {"label": "B"}] }),
    );
    // The out-of-range gap is dropped with a diagnostic; both cards land.
    assert!(diags.iter().any(|d| d.code == "length_out_of_range"));
    let text = all_text(&doc.pages[0]);
    assert!(text.contains("A") && text.contains("B"), "{text}");
}

#[test]
fn repeat_flow_non_object_elements_degrade_to_missing_bindings() {
    let (doc, diags) = run(
        &card_list_body(
            r#"      - type: repeat_flow
        data: { key: cards }
        item:
          box: { h: 20 }
          items:
            - type: text
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        ),
        json!({ "cards": [1, null] }),
    );
    // Bindings warn per element; layout still completes with empty cards.
    assert!(diags.iter().any(|d| d.code == "missing_data"));
    assert_eq!(doc.pages.len(), 1);
}

#[test]
fn repeat_flow_in_absolute_body_warns_and_skips() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: repeat_flow
        data: { key: cards }
        item:
          items: []
"#,
        json!({ "cards": [{}] }),
    );
    assert!(diags
        .iter()
        .any(|d| d.code == "repeat_flow_in_absolute_body"));
    assert!(doc.pages[0].items.is_empty());
}

#[test]
fn repeat_flow_in_container_warns_and_skips() {
    let (_doc, diags) = run(
        &card_list_body(
            r#"      - type: container
        items:
          - type: repeat_flow
            data: { key: cards }
            item:
              items: []
"#,
        ),
        json!({ "cards": [{}] }),
    );
    assert!(diags.iter().any(|d| d.code == "repeat_flow_in_container"));
}

#[test]
fn repeat_flow_in_band_warns_and_skips() {
    let (_doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  header:
    items:
      - type: repeat_flow
        data: { key: cards }
        item:
          items: []
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: text
        text: body
"#,
        json!({ "cards": [{}] }),
    );
    assert!(diags.iter().any(|d| d.code == "repeat_flow_in_band"));
}

#[test]
fn static_image_inside_a_card_draws_like_repeat_cells() {
    let assets = test_assets();
    let (doc, diags) = run_with_assets(
        &card_list_body(
            r#"      - type: repeat_flow
        data: { key: cards }
        item:
          items:
            - type: image
              box: { w: 20, h: 20 }
              src: logo.png
            - type: text
              data: { key: label }
              style: { fontSize: 10, lineHeight: 1.0 }
"#,
        ),
        json!({ "cards": [{"label": "x"}] }),
        Some(&assets),
    );
    assert!(diags.is_empty(), "diags: {diags:?}");
    let shapes = image_shapes(&doc.pages[0]);
    assert_eq!(shapes.len(), 1);
    assert_eq!(shapes[0].asset_id, "src:logo.png");
    assert!(all_text(&doc.pages[0]).contains("x"));
}
