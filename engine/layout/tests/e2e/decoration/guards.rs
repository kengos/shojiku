//! Decoration hostile-input guards: border-width caps, invalid and
//! unbounded color strings, and the color-without-width no-op.

use crate::common::*;

#[test]
fn border_color_alone_draws_nothing() {
    // A named style can carry a palette color; without a width there is
    // no border (and no rect at all).
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: hi
        box: { x: 0, y: 0, w: 50, h: 20 }
        style: { borderColor: "#00ff00" }
"##,
        json!({}),
    );
    assert!(diags.items.is_empty(), "unexpected diagnostics: {diags:?}");
    assert!(rect_shapes(&doc.pages[0]).is_empty());
}

#[test]
fn hostile_border_widths_warn_and_draw_no_border() {
    // Negative widths are parse errors (see core border tests);
    // finite-but-absurd widths still degrade at layout with a warning.
    {
        let width = "1e300";
        let (doc, diags) = run(
            &format!(
                r##"
page: {{ margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: text
        text: hi
        box: {{ x: 0, y: 0, w: 50, h: 20 }}
        style: {{ borderWidth: {width} }}
"##
            ),
            json!({}),
        );
        assert!(
            diags.iter().any(|d| d.code == "invalid_border_width"),
            "width {width}: {diags:?}"
        );
        assert!(rect_shapes(&doc.pages[0]).is_empty(), "width {width}");
    }
    // The per-side map form degrades the same way, warning once per
    // hostile side and drawing nothing.
    let (doc, diags) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: hi
        box: { x: 0, y: 0, w: 50, h: 20 }
        style: { borderWidth: { top: 1e300, bottom: 1 } }
"##,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "invalid_border_width"));
    // The valid bottom side still draws (one filled band).
    assert_eq!(rect_shapes(&doc.pages[0]).len(), 1);
}

#[test]
fn invalid_border_color_warns_and_falls_back_to_black() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: hi
        box: { x: 0, y: 0, w: 50, h: 20 }
        style: { borderWidth: 1, borderColor: "chartreuse" }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "invalid_color"));
    let rects = rect_shapes(&doc.pages[0]);
    assert_eq!(rects[0].stroke, Some((0.0, 0.0, 0.0)));
}

#[test]
fn hostile_color_strings_are_truncated_in_diagnostics() {
    // Colors are attacker-controlled and unbounded; the echo in the
    // diagnostic must stay bounded (32-char snippet + ellipsis).
    let long = "x".repeat(10_000);
    let (_, diags) = run(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: text
        text: hi
        box: {{ x: 0, y: 0, w: 50, h: 20 }}
        style: {{ borderWidth: 1, borderColor: "{long}", backgroundColor: "{long}" }}
"#
        ),
        json!({}),
    );
    let colors: Vec<_> = diags.iter().filter(|d| d.code == "invalid_color").collect();
    assert_eq!(colors.len(), 2, "border + background: {diags:?}");
    for d in colors {
        assert!(d.message.len() < 120, "unbounded echo: {}", d.message);
        assert!(d.message.contains('…'));
    }
}
