//! Form-mark path playback on the PNG backend: a checkbox draws dark
//! pixels (fill + round-stroked check), and an empty path is skipped.

use super::*;
use shojiku_image::AssetStore;
use shojiku_layout::PathShape;

#[test]
fn checkbox_and_filled_ellipse_draw_pixels() {
    // The checkbox check exercises the stroke path; the filled ellipse
    // exercises the fill path of `draw_path`.
    let pages = render(
        r##"
page: { size: { w: 30mm, h: 30mm }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: checkbox
        box: { x: 3, y: 3, w: 12, h: 12 }
        checked: true
      - type: ellipse
        box: { x: 3, y: 20, w: 18, h: 12 }
        style: { backgroundColor: "#ff0000" }
"##,
        json!({}),
    );
    let (w, h, rgba) = decode(&pages[0]);
    let mut dark = false;
    let mut red = false;
    for y in 0..h {
        for x in 0..w {
            let p = pixel(&rgba, w, x, y);
            dark |= p[0] < 128 && p[1] < 128 && p[2] < 128;
            red |= p[0] > 200 && p[1] < 80 && p[2] < 80;
        }
    }
    assert!(dark, "checkbox stroke pixels");
    assert!(red, "filled ellipse pixels");
}

#[test]
fn empty_path_is_skipped() {
    let path = LayoutItem::Path(PathShape {
        cmds: vec![],
        stroke: Some((0.0, 0.0, 0.0)),
        stroke_width: 1.0,
        fill: None,
        opacity: 1.0,
    });
    let doc = LayoutDocument {
        page_width: 50.0,
        page_height: 50.0,
        pages: vec![LayoutPage { items: vec![path] }],
    };
    let out =
        render_png(&doc, fonts(), &AssetStore::empty(), &PngOptions::default()).expect("render");
    assert_eq!(out.len(), 1);
}
