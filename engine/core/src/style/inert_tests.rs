//! Tests for the context-inert style key lists (`style/inert.rs`).

use crate::style::Style;
use crate::{parse_template, Body, Item};

/// Parses a bare `style:` map into a [`Style`].
fn style(yaml: &str) -> Style {
    serde_yaml::from_str(yaml).expect("style parses")
}

#[test]
fn span_ignores_box_level_keys_by_wire_name() {
    let keys =
        style("borderRadius: 4\nbackgroundColor: \"#eeeeee\"\nlineHeight: 2").ignored_span_keys();
    assert_eq!(keys, vec!["lineHeight", "backgroundColor", "borderRadius"]);
}

#[test]
fn span_honors_the_run_level_keys() {
    // The eight keys a run genuinely applies must never be reported.
    let keys = style(
        "fontSize: 12\nfontFamily: biz-ud-gothic\nfontWeight: bold\nfontStyle: italic\n\
         letterSpacing: 1\ncolor: \"#112233\"\ntextDecoration: underline\n\
         textCombineUpright: { digits: 2 }",
    )
    .ignored_span_keys();
    assert!(keys.is_empty(), "unexpected inert keys: {keys:?}");
}

#[test]
fn shape_honors_the_box_decoration_subset_including_radius() {
    // A shape draws a box, so every decoration key — radius included —
    // is legitimate on it and must not be reported.
    let keys = style(
        "backgroundColor: \"#ffffff\"\nborderWidth: 1\nborderColor: \"#000000\"\n\
         borderStyle: dashed\nborderRadius: \"25%\"\nopacity: 0.5",
    )
    .ignored_shape_keys();
    assert!(keys.is_empty(), "unexpected inert keys: {keys:?}");
}

#[test]
fn shape_reports_text_keys_by_wire_name() {
    let keys = style("fontSize: 10\ntextAlign: center").ignored_shape_keys();
    assert_eq!(keys, vec!["fontSize", "textAlign"]);
}

#[test]
fn an_unset_style_reports_nothing_in_either_list() {
    let empty = Style::default();
    assert!(empty.ignored_span_keys().is_empty());
    assert!(empty.ignored_shape_keys().is_empty());
}

#[test]
fn border_radius_on_a_span_is_reported_through_a_real_template() {
    // The list feeds a validation diagnostic, so pin it end-to-end from
    // authored YAML rather than only through the constructed struct.
    let t = parse_template(
        r##"
version: 1
page: { size: A4 }
sections:
  body:
    type: flow
    items:
      - type: text
        box: { x: 0, y: 0, w: 200 }
        spans:
          - text: "x"
            style: { borderRadius: 3 }
"##,
    )
    .expect("template parses");
    let Body::Flow(flow) = &t.sections.body else {
        panic!("flow body");
    };
    let Item::Text(text) = &flow.items[0] else {
        panic!("text item");
    };
    let span = &text.spans[0];
    assert_eq!(
        span.style.ignored_span_keys(),
        vec!["borderRadius"],
        "a radius on a run has no box to round"
    );
}
