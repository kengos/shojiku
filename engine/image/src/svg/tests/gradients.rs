//! Gradient parsing: linear/radial geometry, units, transforms, stops,
//! and `href` stop inheritance.

use super::*;

#[test]
fn linear_object_bounding_box_maps_to_bbox() {
    let tree = parse(
        r##"<svg viewBox="0 0 100 100">
              <defs><linearGradient id="g">
                <stop offset="0" stop-color="#ff0000"/>
                <stop offset="1" stop-color="#0000ff"/>
              </linearGradient></defs>
              <rect x="10" y="20" width="40" height="30" fill="url(#g)"/>
            </svg>"##,
    );
    let g = linear(&tree.paths[0]);
    // objectBoundingBox: local coords are unit fractions, the transform is
    // the bbox map (w,0,0,h,min_x,min_y).
    assert!(close(g.x1, 0.0) && close(g.y1, 0.0) && close(g.x2, 1.0) && close(g.y2, 0.0));
    assert_eq!(g.transform, [40.0, 0.0, 0.0, 30.0, 10.0, 20.0]);
    assert_eq!(g.spread, SpreadMode::Pad);
    assert_eq!(g.stops.len(), 2);
    assert_eq!(g.stops[0].color, (1.0, 0.0, 0.0));
    assert!(close(g.stops[0].offset as f64, 0.0) && close(g.stops[1].offset as f64, 1.0));
    assert_eq!(g.stops[1].color, (0.0, 0.0, 1.0));
    assert!(tree.warnings.is_empty(), "warnings: {:?}", tree.warnings);
}

#[test]
fn linear_user_space_resolves_percent_against_viewbox() {
    let tree = parse(
        r##"<svg viewBox="0 0 200 100">
              <linearGradient id="g" gradientUnits="userSpaceOnUse"
                              x1="0" y1="0" x2="50%" y2="10">
                <stop offset="0" stop-color="#000"/>
                <stop offset="100%" stop-color="#fff"/>
              </linearGradient>
              <rect width="200" height="100" fill="url(#g)"/>
            </svg>"##,
    );
    let g = linear(&tree.paths[0]);
    // 50% of the 200-wide viewBox = 100; user units otherwise.
    assert!(close(g.x2, 100.0) && close(g.y2, 10.0));
    assert_eq!(g.transform, [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);
    assert!(close(g.stops[1].offset as f64, 1.0));
}

#[test]
fn gradient_transform_composes_with_ctm() {
    let tree = parse(
        r##"<svg viewBox="0 0 100 100">
              <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" x2="10"
                              gradientTransform="translate(5 3)">
                <stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/>
              </linearGradient>
              <rect width="100" height="100" fill="url(#g)"/>
            </svg>"##,
    );
    let g = linear(&tree.paths[0]);
    assert_eq!(g.transform, [1.0, 0.0, 0.0, 1.0, 5.0, 3.0]);
}

#[test]
fn radial_focal_and_end_circle() {
    let tree = parse(
        r##"<svg viewBox="0 0 100 100">
              <radialGradient id="g" gradientUnits="userSpaceOnUse"
                              cx="50" cy="50" r="40" fx="30" fy="20">
                <stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/>
              </radialGradient>
              <rect width="100" height="100" fill="url(#g)"/>
            </svg>"##,
    );
    let g = radial(&tree.paths[0]);
    assert!(close(g.cx, 50.0) && close(g.cy, 50.0) && close(g.cr, 40.0));
    assert!(close(g.fx, 30.0) && close(g.fy, 20.0) && close(g.fr, 0.0));
}

#[test]
fn radial_defaults_center_the_gradient() {
    let tree = parse(
        r##"<svg viewBox="0 0 100 100">
              <radialGradient id="g">
                <stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/>
              </radialGradient>
              <rect x="0" y="0" width="80" height="60" fill="url(#g)"/>
            </svg>"##,
    );
    let g = radial(&tree.paths[0]);
    // Missing cx/cy/r/fx/fy default to 50%; focal defaults to the center.
    assert!(close(g.cx, 0.5) && close(g.cy, 0.5) && close(g.cr, 0.5));
    assert!(close(g.fx, 0.5) && close(g.fy, 0.5));
    assert_eq!(g.transform, [80.0, 0.0, 0.0, 60.0, 0.0, 0.0]);
}

#[test]
fn href_inherits_stops_across_gradients() {
    let tree = parse(
        r##"<svg xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">
              <defs>
                <linearGradient id="stops">
                  <stop offset="0" stop-color="#ff0000"/>
                  <stop offset="1" stop-color="#0000ff"/>
                </linearGradient>
                <linearGradient id="g" xlink:href="#stops"
                                gradientUnits="userSpaceOnUse" x1="0" x2="10"/>
              </defs>
              <rect width="10" height="10" fill="url(#g)"/>
            </svg>"##,
    );
    let g = linear(&tree.paths[0]);
    assert_eq!(g.stops.len(), 2);
    assert_eq!(g.stops[0].color, (1.0, 0.0, 0.0));
    assert_eq!(g.stops[1].color, (0.0, 0.0, 1.0));
}

#[test]
fn stops_read_color_and_opacity_from_style() {
    let tree = parse(
        r##"<svg viewBox="0 0 10 10">
              <linearGradient id="g">
                <stop offset="0" style="stop-color:#00ff00;stop-opacity:0.5"/>
                <stop offset="1" style="stop-color:#000000"/>
              </linearGradient>
              <rect width="10" height="10" fill="url(#g)"/>
            </svg>"##,
    );
    let g = linear(&tree.paths[0]);
    assert_eq!(g.stops[0].color, (0.0, 1.0, 0.0));
    assert!(close(g.stops[0].opacity as f64, 0.5));
    assert!(close(g.stops[1].opacity as f64, 1.0));
}

#[test]
fn spread_methods_parse() {
    let tree = parse(
        r##"<svg viewBox="0 0 20 10">
              <linearGradient id="a" spreadMethod="reflect">
                <stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/>
              </linearGradient>
              <linearGradient id="b" spreadMethod="repeat">
                <stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/>
              </linearGradient>
              <rect width="10" height="10" fill="url(#a)"/>
              <rect x="10" width="10" height="10" fill="url(#b)"/>
            </svg>"##,
    );
    assert_eq!(linear(&tree.paths[0]).spread, SpreadMode::Reflect);
    assert_eq!(linear(&tree.paths[1]).spread, SpreadMode::Repeat);
}
