//! SVG gradient rendering: pixels actually interpolate, and degenerate
//! gradients skip without panicking.

use super::*;
use shojiku_image::{Asset, AssetStore, SvgLimits};

/// A one-page 100x100pt doc drawing SVG asset `id` over the whole page.
fn svg_page(svg: &str) -> (AssetStore, LayoutDocument) {
    let tree = shojiku_image::parse_svg(svg, &SvgLimits::default()).expect("parse svg");
    let mut store = AssetStore::empty();
    store.insert(Asset {
        id: "g".to_string(),
        kind: AssetKind::Svg(tree),
    });
    let doc = LayoutDocument {
        metadata: Default::default(),
        page_width: 100.0,
        page_height: 100.0,
        pages: vec![LayoutPage {
            items: vec![LayoutItem::Image(ImageShape {
                asset_id: "g".to_string(),
                opacity: 1.0,
                link: None,
                x: 0.0,
                y: 0.0,
                w: 100.0,
                h: 100.0,
            })],
        }],
    };
    (store, doc)
}

fn render_svg(svg: &str) -> (u32, Vec<u8>) {
    let (store, doc) = svg_page(svg);
    let pages = render_png(&doc, fonts(), &store, &PngOptions::default()).expect("render");
    let (w, _h, rgba) = decode(&pages[0]);
    (w, rgba)
}

#[test]
fn svg_opacity_composites_as_a_group_over_the_background() {
    // A solid black SVG rect at opacity 0.5 over the white page yields a
    // mid-grey, exercising the group-composite branch (a transparent layer
    // composited with the alpha) rather than per-path blending.
    let (store, mut doc) = svg_page(
        r##"<svg viewBox='0 0 10 10'><rect width='10' height='10' fill='#000000'/></svg>"##,
    );
    if let LayoutItem::Image(shape) = &mut doc.pages[0].items[0] {
        shape.opacity = 0.5;
    }
    let pages = render_png(&doc, fonts(), &store, &PngOptions::default()).expect("render");
    let (w, _h, rgba) = decode(&pages[0]);
    let mid = pixel(&rgba, w, w / 2, w / 2);
    // 0.5*black + 0.5*white ≈ mid-grey on every channel.
    assert!(
        (100..=160).contains(&(mid[0] as u32)),
        "half-opacity black over white should be grey: {mid:?}"
    );
}

#[test]
fn linear_gradient_interpolates_left_to_right() {
    // Red at x=0 -> blue at x=100, in user space across the whole viewBox.
    let (w, rgba) = render_svg(
        r##"<svg viewBox='0 0 100 100'>
              <linearGradient id='g' gradientUnits='userSpaceOnUse' x1='0' y1='0' x2='100' y2='0'>
                <stop offset='0' stop-color='#ff0000'/>
                <stop offset='1' stop-color='#0000ff'/>
              </linearGradient>
              <rect width='100' height='100' fill='url(#g)'/>
            </svg>"##,
    );
    let y = w / 2;
    let left = pixel(&rgba, w, 3, y);
    let mid = pixel(&rgba, w, w / 2, y);
    let right = pixel(&rgba, w, w - 4, y);
    assert!(
        left[0] > 200 && left[2] < 60,
        "left should be red: {left:?}"
    );
    assert!(
        right[2] > 200 && right[0] < 60,
        "right should be blue: {right:?}"
    );
    // The midpoint mixes both channels rather than being either endpoint.
    assert!(mid[0] > 60 && mid[2] > 60, "middle should blend: {mid:?}");
}

#[test]
fn radial_gradient_is_brighter_at_the_center() {
    // White center -> black edge, objectBoundingBox (default).
    let (w, rgba) = render_svg(
        r##"<svg viewBox='0 0 100 100'>
              <radialGradient id='g'>
                <stop offset='0' stop-color='#ffffff'/>
                <stop offset='1' stop-color='#000000'/>
              </radialGradient>
              <rect width='100' height='100' fill='url(#g)'/>
            </svg>"##,
    );
    let center = pixel(&rgba, w, w / 2, w / 2);
    let corner = pixel(&rgba, w, 3, 3);
    assert!(
        center[0] > corner[0] + 80,
        "center brighter: {center:?} vs {corner:?}"
    );
}

#[test]
fn reflect_and_repeat_spread_modes_render() {
    // Short gradients (0..20 across a 100-wide box) so pad vs reflect/repeat
    // differ; we only need both spread arms to execute and draw ink.
    let (_w, rgba) = render_svg(
        r##"<svg viewBox='0 0 100 100'>
              <linearGradient id='a' gradientUnits='userSpaceOnUse' x1='0' x2='20' spreadMethod='reflect'>
                <stop offset='0' stop-color='#ff0000'/><stop offset='1' stop-color='#0000ff'/>
              </linearGradient>
              <radialGradient id='b' gradientUnits='userSpaceOnUse' cx='50' cy='75' r='10' spreadMethod='repeat'>
                <stop offset='0' stop-color='#00ff00'/><stop offset='1' stop-color='#000000'/>
              </radialGradient>
              <rect width='100' height='50' fill='url(#a)'/>
              <rect y='50' width='100' height='50' fill='url(#b)'/>
            </svg>"##,
    );
    assert!(
        rgba.iter().any(|&b| b != 255),
        "spread gradients drew nothing"
    );
}

#[test]
fn degenerate_gradients_skip_without_panic() {
    // A linear endpoint that overflows f32 (non-finite length) and a radial
    // with a negative radius both make tiny-skia reject the shader; the
    // fills are skipped and the page still renders on its white background.
    let (_w, rgba) = render_svg(
        r##"<svg viewBox='0 0 100 100'>
              <linearGradient id='lg' gradientUnits='userSpaceOnUse' x1='0' x2='1e40'>
                <stop offset='0' stop-color='#ff0000'/><stop offset='1' stop-color='#0000ff'/>
              </linearGradient>
              <radialGradient id='rg' gradientUnits='userSpaceOnUse' cx='50' cy='50' r='-40'>
                <stop offset='0' stop-color='#00ff00'/><stop offset='1' stop-color='#000000'/>
              </radialGradient>
              <rect width='100' height='50' fill='url(#lg)'/>
              <rect y='50' width='100' height='50' fill='url(#rg)'/>
            </svg>"##,
    );
    assert!(
        rgba.iter().all(|&b| b == 255),
        "degenerate gradients drew pixels"
    );
}
