//! Gradient guards: unresolvable refs, cycles, degenerate boxes, caps, and
//! malformed attributes all degrade to warnings without panicking.

use super::*;

/// A single gradient-filled rect whose gradient is `defs`.
fn one_rect(defs: &str, fill: &str) -> SvgTree {
    parse(&format!(
        r##"<svg viewBox="0 0 10 10"><defs>{defs}</defs>
              <rect width="10" height="10" fill="{fill}"/></svg>"##
    ))
}

#[test]
fn empty_and_missing_gradients_skip_the_fill() {
    let empty = one_rect(r##"<linearGradient id="g"/>"##, "url(#g)");
    assert!(empty.paths.is_empty(), "empty-stops gradient should skip");
    let missing = one_rect("", "url(#nope)");
    assert!(missing.paths.is_empty(), "unknown ref should skip");
}

#[test]
fn gradient_without_id_is_dropped() {
    let tree = one_rect(
        r##"<linearGradient><stop offset="0" stop-color="#000"/></linearGradient>"##,
        "url(#g)",
    );
    assert!(tree.paths.is_empty());
}

#[test]
fn href_cycle_warns_and_skips() {
    let tree = one_rect(
        r##"<linearGradient id="a" href="#b"/><linearGradient id="b" href="#a"/>"##,
        "url(#a)",
    );
    assert!(tree.paths.is_empty());
    assert!(
        tree.warnings.iter().any(|w| w.contains("cycle")),
        "{:?}",
        tree.warnings
    );
}

#[test]
fn href_chain_too_deep_warns() {
    let defs: String = (0..10)
        .map(|i| format!(r##"<linearGradient id="g{i}" href="#g{}"/>"##, i + 1))
        .collect();
    let tree = one_rect(&defs, "url(#g0)");
    assert!(
        tree.warnings.iter().any(|w| w.contains("too deep")),
        "{:?}",
        tree.warnings
    );
}

#[test]
fn object_bounding_box_on_zero_area_shape_warns() {
    let tree = parse(
        r##"<svg viewBox="0 0 10 10">
              <linearGradient id="g">
                <stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/>
              </linearGradient>
              <path d="M0,5 L10,5 Z" fill="url(#g)"/>
            </svg>"##,
    );
    assert!(tree.paths.is_empty());
    assert!(
        tree.warnings.iter().any(|w| w.contains("empty shape")),
        "{:?}",
        tree.warnings
    );
}

#[test]
fn stop_count_is_capped() {
    let stops: String = (0..300)
        .map(|i| {
            format!(
                r##"<stop offset="{}" stop-color="#000"/>"##,
                i as f64 / 300.0
            )
        })
        .collect();
    let tree = one_rect(
        &format!(r##"<linearGradient id="g">{stops}</linearGradient>"##),
        "url(#g)",
    );
    assert_eq!(linear(&tree.paths[0]).stops.len(), 256);
}

#[test]
fn out_of_range_stop_offset_and_opacity_clamp() {
    let tree = one_rect(
        r##"<linearGradient id="g">
              <stop offset="-1" stop-color="#000" stop-opacity="2"/>
              <stop offset="5" stop-color="#fff" stop-opacity="-1"/>
            </linearGradient>"##,
        "url(#g)",
    );
    let g = linear(&tree.paths[0]);
    assert!(close(g.stops[0].offset as f64, 0.0) && close(g.stops[1].offset as f64, 1.0));
    assert!(close(g.stops[0].opacity as f64, 1.0) && close(g.stops[1].opacity as f64, 0.0));
}

#[test]
fn non_finite_stop_opacity_becomes_zero() {
    let tree = one_rect(
        r##"<linearGradient id="g">
              <stop offset="0" stop-color="#000" stop-opacity="inf"/>
              <stop offset="1" stop-color="#fff"/>
            </linearGradient>"##,
        "url(#g)",
    );
    assert!(close(linear(&tree.paths[0]).stops[0].opacity as f64, 0.0));
}

#[test]
fn malformed_attributes_warn_and_default() {
    let tree = parse(
        r##"<svg viewBox="0 0 100 100">
              <linearGradient id="g" gradientUnits="bogus" spreadMethod="bogus"
                              x1="abc" x2="5em">
                <stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/>
              </linearGradient>
              <rect width="100" height="100" fill="url(#g)"/>
            </svg>"##,
    );
    let w = &tree.warnings;
    assert!(w.iter().any(|m| m.contains("gradientUnits")), "{w:?}");
    assert!(w.iter().any(|m| m.contains("spreadMethod")), "{w:?}");
    assert!(
        w.iter().any(|m| m.contains("invalid gradient `x1`")),
        "{w:?}"
    );
    assert!(
        w.iter()
            .any(|m| m.contains("unsupported unit in gradient `x2`")),
        "{w:?}"
    );
    // Unknown units fall back to objectBoundingBox, so the fill still draws.
    assert_eq!(linear(&tree.paths[0]).spread, SpreadMode::Pad);
}

#[test]
fn gradient_stroke_is_ignored() {
    let tree = parse(
        r##"<svg viewBox="0 0 10 10">
              <linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient>
              <rect width="10" height="10" fill="#ff0000" stroke="url(#g)"/>
            </svg>"##,
    );
    let path = &tree.paths[0];
    assert_eq!(solid_fill(path), Some((1.0, 0.0, 0.0)));
    assert_eq!(path.stroke, None);
    assert!(
        tree.warnings
            .iter()
            .any(|w| w.contains("gradient stroke ignored")),
        "{:?}",
        tree.warnings
    );
}
