//! Form-mark path playback on the PDF backend: a real ellipse/checkbox
//! template renders, and a degenerate (empty) path is skipped.

use super::*;
use shojiku_image::AssetStore;
use shojiku_layout::{LayoutDocument, LayoutPage, PathShape};

#[test]
fn ellipse_and_checkbox_render_through_the_pipeline() {
    let bytes = render_template(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: ellipse
        box: { x: 10, y: 10, w: 40, h: 30 }
        style: { backgroundColor: "#ffcc00" }
      - type: checkbox
        box: { x: 60, y: 10, w: 12, h: 12 }
        checked: true
"##,
        json!({}),
    );
    assert!(bytes.starts_with(b"%PDF"));
}

#[test]
fn empty_path_is_skipped() {
    let (_pack, fonts) = shared_fonts();
    let path = LayoutItem::Path(PathShape {
        cmds: vec![],
        stroke: Some((0.0, 0.0, 0.0)),
        stroke_width: 1.0,
        fill: None,
        opacity: 1.0,
    });
    let doc = LayoutDocument {
        metadata: Default::default(),
        page_width: 100.0,
        page_height: 100.0,
        pages: vec![LayoutPage { items: vec![path] }],
    };
    let bytes = render_pdf(&doc, fonts, &AssetStore::empty()).expect("render");
    assert!(bytes.starts_with(b"%PDF"));
}
