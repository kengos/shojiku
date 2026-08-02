//! Dashed strokes and rounded corners on the PDF backend. Pixel-exact
//! behavior is asserted on the PNG backend (both consume the same tree);
//! here the concern is that the krilla calls are well-formed and that a
//! hand-built degenerate pattern cannot blank a stroke.

use super::*;
use crate::draw::dash_of;
use shojiku_layout::Dash;

#[test]
fn renders_dashed_dotted_and_rounded_boxes() {
    let bytes = render_template(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: rect
        box: { x: 20, y: 20, w: 160, h: 60 }
        style: { borderWidth: 2, borderStyle: dashed, borderRadius: 8 }
      - type: rect
        box: { x: 20, y: 100, w: 160, h: 60 }
        style: { borderWidth: 2, borderStyle: dotted }
      - type: rect
        box: { x: 20, y: 180, w: 160, h: 60 }
        style: { backgroundColor: '#eeeeee', borderRadius: "50%" }
      - type: line
        from: { x: 20, y: 260 }
        to: { x: 180, y: 260 }
        style: { width: 0.8, style: dashed }
"##,
        json!({}),
    );
    assert!(bytes.starts_with(b"%PDF-"));
    let content = String::from_utf8_lossy(&bytes);
    let pages = content.matches("/Type /Page").count() + content.matches("/Type/Page").count();
    assert!(pages >= 1, "the dashed/rounded page is written");
}

#[test]
fn a_valid_pattern_becomes_a_two_entry_dash_array() {
    let dash = dash_of(Some(Dash { on: 6.0, off: 3.0 })).expect("a usable pattern");
    assert_eq!(dash.array, vec![6.0_f32, 3.0]);
    assert_eq!(dash.offset, 0.0, "a pattern starts painted");
}

#[test]
fn no_pattern_means_no_dash() {
    assert!(dash_of(None).is_none());
}

#[test]
fn a_degenerate_pattern_falls_back_to_a_solid_stroke() {
    // tiny-skia (which krilla forwards to) REJECTS a non-positive or
    // non-finite interval by dropping the whole stroke, so an unusable
    // pattern from a hand-built tree must degrade to solid rather than
    // silently blanking the border.
    for bad in [
        Dash { on: 0.0, off: 3.0 },
        Dash { on: 3.0, off: 0.0 },
        Dash { on: -1.0, off: 3.0 },
        Dash {
            on: f64::NAN,
            off: 3.0,
        },
        Dash {
            on: 3.0,
            off: f64::INFINITY,
        },
    ] {
        assert!(
            dash_of(Some(bad)).is_none(),
            "{bad:?} must not reach krilla"
        );
    }
}
