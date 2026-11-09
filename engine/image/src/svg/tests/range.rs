//! The coordinate range: a path with a coordinate past `RANGE_RATIO`
//! viewBox sizes (per axis) or with a non-finite coordinate is not drawn,
//! a stroke past the stroke limit is not drawn, a gradient past twice the
//! range is not used, the viewBox itself is limited, and one arc flattens
//! to a bounded number of cubics.

use super::*;
use crate::svg::bound::{GRADIENT_DROPPED, NON_FINITE, OUT_OF_RANGE, STROKE_DROPPED};

fn warned(tree: &SvgTree, needle: &str) -> bool {
    tree.warnings.iter().any(|w| w == needle)
}

/// A viewBox of 1,000,000 units, whose range (1e9) holds every arc below.
const WIDE: &str = "0 0 1000000 1000000";

/// The number of cubics one arc segment `A r r 0 1 1 to 0` emits after its
/// `M 0 0`, in a viewBox `view`, asserting the path was drawn.
fn arc_cmds(view: &str, r: &str, to: &str) -> usize {
    let tree = parse(&format!(
        "<svg viewBox='{view}'><path d='M0 0 A{r} {r} 0 1 1 {to} 0'/></svg>"
    ));
    assert!(tree.warnings.is_empty(), "r={r}: {:?}", tree.warnings);
    assert_eq!(tree.paths.len(), 1, "r={r}: the path was not drawn");
    tree.paths[0].cmds.len() - 1
}

/// The number of cubics kurbo makes at `tolerance` for the arc of
/// `arc_cmds(_, r, "1")`.
fn kurbo_cubics(r: f64, tolerance: f64) -> usize {
    let arc = kurbo::Arc::from_svg_arc(&kurbo::SvgArc {
        from: kurbo::Point::new(0.0, 0.0),
        to: kurbo::Point::new(1.0, 0.0),
        radii: kurbo::Vec2::new(r, r),
        x_rotation: 0.0,
        large_arc: true,
        sweep: true,
    })
    .expect("arc");
    let mut count = 0;
    arc.to_cubic_beziers(tolerance, |_, _, _| count += 1);
    count
}

#[test]
fn an_arc_flattens_to_at_most_eleven_cubics_whatever_its_radius() {
    // A semicircle of radius 5e8 inside the WIDE range: the radius-scaled
    // tolerance (500 units) flattens it to at most eleven cubics.
    let cubics = arc_cmds(WIDE, "5e8", "1e9");
    assert!((2..=11).contains(&cubics), "{cubics}");
    // With the fixed 0.1 tolerance used before the radius-scaled one, these
    // arcs yielded 1,494,964 and about 66,000 cubics: a huge radius with a
    // chord large enough to keep the sweep, and a tiny radius that kurbo
    // enlarges to half of a huge chord. Both reach past the range and are
    // not drawn; the cap bounds how many times kurbo calls the sink for each
    // arc (about 1.5 million times without it), and the sink ignores every
    // call after its first refusal.
    for d in ["M0 0 A1e36 1e36 0 1 1 1e23 0", "M0 0 A1 1 0 1 1 1e30 0"] {
        let tree = parse(&format!("<svg viewBox='{WIDE}'><path d='{d}'/></svg>"));
        assert!(tree.paths.is_empty(), "{d}");
        assert!(warned(&tree, OUT_OF_RANGE), "{d}: {:?}", tree.warnings);
    }
}

#[test]
fn an_arc_with_a_radius_up_to_100000_units_uses_the_0_1_tolerance() {
    for r in [5.0_f64, 99_999.0] {
        let expected = kurbo_cubics(r, 0.1);
        assert!(
            expected > 1,
            "r={r}: kurbo at tolerance 0.1 yields more than one cubic for this arc"
        );
        assert_eq!(arc_cmds(WIDE, &r.to_string(), "1"), expected, "r={r}");
    }
}

#[test]
fn an_arc_with_a_larger_radius_uses_a_millionth_of_the_radius() {
    // At a radius of 1e6 the tolerance is 1.0, which flattens to fewer
    // cubics than 0.1 would; the count pins the ratio, not only the floor.
    let expected = kurbo_cubics(1e6, 1.0);
    assert!(expected < kurbo_cubics(1e6, 0.1));
    assert_eq!(arc_cmds(WIDE, "1000000", "1"), expected);
}

#[test]
fn a_viewbox_past_a_limit_refuses_the_svg() {
    for root in [
        "viewBox='0 0 0.0001 10'",
        "viewBox='0 0 10 10000000'",
        "viewBox='10000000000 0 10 10'",
        "width='10000000' height='10'",
    ] {
        let err = parse_svg(&format!("<svg {root}/>"), &SvgLimits::default())
            .expect_err("past a viewBox limit");
        assert!(
            err.to_string().contains("outside the supported range"),
            "{root}: {err}"
        );
    }
    parse(&format!("<svg viewBox='{WIDE}'/>"));
    parse("<svg viewBox='0 0 0.001 0.001'/>");
    // A map export in projected coordinates: the origin is far from zero,
    // and a shape at the origin is drawn at 0.
    let tree = parse(
        "<svg viewBox='500000 4100000 1000 1000'><rect x='500000' y='4100000' width='10' height='10'/></svg>",
    );
    assert_eq!(tree.paths[0].cmds[0], PathCmd::MoveTo(0.0, 0.0));
}

#[test]
fn a_path_reaching_past_the_range_is_not_drawn() {
    // ViewBox 10: the range is |x|, |y| <= 1e4. A horizontal line through
    // the viewBox at y = 9, a band across it, a large background, a finite
    // f64 larger than `f32::MAX`, and a transform that scales a unit circle
    // past the range. None of them is drawn.
    for svg in [
        "<path d='M-1e12 9 L1e12 9' stroke='#000'/>",
        "<rect x='-5e4' y='0' width='1e5' height='1'/>",
        "<rect x='-1e6' y='-1e6' width='2e6' height='2e6'/>",
        "<rect width='1e39' height='1'/>",
        "<g transform='scale(1e30)'><circle r='1'/></g>",
        "<polyline points='0,0 1e300,0' stroke='#000'/>",
    ] {
        let tree = parse(&format!("<svg viewBox='0 0 10 10'>{svg}</svg>"));
        assert!(tree.paths.is_empty(), "{svg}: drawn");
        assert!(warned(&tree, OUT_OF_RANGE), "{svg}: {:?}", tree.warnings);
        assert!(!warned(&tree, NON_FINITE), "{svg}: {:?}", tree.warnings);
    }
}

#[test]
fn only_the_path_past_the_range_is_left_out() {
    // A rect 1e7 units left of the viewBox next to a circle inside it: the
    // circle is drawn, the rect is not, with one warning. A compound path
    // with one far subpath is left out whole.
    let tree = parse(
        "<svg viewBox='0 0 10 10'><rect x='-1e7' width='1' height='1'/><circle cx='5' cy='5' r='4'/></svg>",
    );
    assert_eq!(tree.paths.len(), 1);
    assert_eq!(tree.warnings, [OUT_OF_RANGE]);
    let tree = parse("<svg viewBox='0 0 10 10'><path d='M1 1 L9 1 L9 9 Z M1e7 0 L1e7 1 Z'/></svg>");
    assert!(tree.paths.is_empty());
}

#[test]
fn the_range_is_per_axis() {
    // ViewBox 10 x 1000: |x| <= 1e4, |y| <= 1e6.
    let tree =
        parse("<svg viewBox='0 0 10 1000'><polyline points='0,0 0,999999' stroke='#000'/></svg>");
    assert!(tree.warnings.is_empty(), "{:?}", tree.warnings);
    assert_eq!(tree.paths[0].cmds[1], PathCmd::LineTo(0.0, 999_999.0));
    let tree = parse(
        "<svg viewBox='0 0 10 1000'><polyline points='0,500 10001,500' stroke='#000'/></svg>",
    );
    assert!(tree.paths.is_empty());
}

#[test]
fn a_shape_with_a_non_finite_coordinate_is_not_drawn() {
    // inf, NaN (inf * 0 in the composed matrix), the sum of two finite
    // numbers overflowing, a curve whose control point overflows, and an
    // arc whose radius squared overflows (kurbo yields no cubic for it,
    // which would otherwise drop the arc silently and start the line from
    // its end point).
    for svg in [
        "<path d='M0 0 A1e200 1e200 0 1 1 1 0 L0 5' stroke='#000'/>",
        "<g transform='scale(1e300)'><rect width='1e10' height='1'/></g>",
        "<g transform='scale(1e300) scale(1e300)'><rect width='1' height='1'/></g>",
        "<g transform='scale(1e-305)'><rect x='1e308' width='1e308' height='1'/></g>",
        "<g transform='scale(1e-305)'><path d='M1e308 0 c1e308 0 1 1 1 1' stroke='#000'/></g>",
    ] {
        let tree = parse(&format!("<svg viewBox='0 0 10 10'>{svg}</svg>"));
        assert!(tree.paths.is_empty(), "{svg}: drawn");
        assert!(warned(&tree, NON_FINITE), "{svg}: {:?}", tree.warnings);
    }
}

#[test]
fn a_gradient_beyond_twice_the_range_is_not_used_and_warns() {
    // ViewBox 10: the gradient limit is 2e4.
    let stops = r##"<stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/>"##;
    for def in [
        format!(
            r##"<linearGradient id="g" gradientUnits="userSpaceOnUse" x2="1e5">{stops}</linearGradient>"##
        ),
        format!(
            r##"<radialGradient id="g" gradientUnits="userSpaceOnUse" r="1e5">{stops}</radialGradient>"##
        ),
        format!(
            r##"<linearGradient id="g" gradientTransform="scale(1e5)">{stops}</linearGradient>"##
        ),
    ] {
        let tree = parse(&format!(
            r##"<svg viewBox="0 0 10 10"><defs>{def}</defs>
                  <rect width="10" height="10" fill="url(#g)" stroke="#000"/></svg>"##
        ));
        assert!(warned(&tree, GRADIENT_DROPPED), "{def}: no warning");
        // The fill is dropped; the stroke still draws.
        assert!(tree.paths[0].fill.is_none(), "{def}: the fill was kept");
        assert!(tree.paths[0].stroke.is_some());
    }
    // A bounding-box gradient on a shape spanning the whole range is kept.
    let tree = parse(&format!(
        r##"<svg viewBox="0 0 10 10"><defs><linearGradient id="g">{stops}</linearGradient></defs>
              <rect x="-1e4" y="-1e4" width="2e4" height="2e4" fill="url(#g)"/></svg>"##
    ));
    assert!(tree.warnings.is_empty(), "{:?}", tree.warnings);
    assert!(matches!(tree.paths[0].fill, Some(SvgPaint::Linear(_))));
}

#[test]
fn a_user_space_gradient_under_a_far_origin_is_kept_and_rebased() {
    // The viewBox origin (30000) and a group translate (-30000) are past the
    // 2e4 gradient limit; the translation is moved into the points, so the
    // gradient spans 0..10 in viewBox units with no translation left.
    let stops = r##"<stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/>"##;
    for (view, group, x1) in [
        ("30000 0 10 10", "", "30000"),
        ("0 0 10 10", " transform='translate(-30000)'", "30000"),
    ] {
        let tree = parse(&format!(
            r##"<svg viewBox="{view}"><defs><linearGradient id="g" gradientUnits="userSpaceOnUse"
                  x1="{x1}" x2="{x1}" y2="10">{stops}</linearGradient></defs>
                  <g{group}><rect x="{x1}" width="10" height="10" fill="url(#g)"/></g></svg>"##
        ));
        assert!(tree.warnings.is_empty(), "{view}: {:?}", tree.warnings);
        let g = linear(&tree.paths[0]);
        assert!(close(g.x1, 0.0) && close(g.y2, 10.0), "{view}: {g:?}");
        assert_eq!((g.transform[4], g.transform[5]), (0.0, 0.0), "{view}");
    }
    // A radial gradient's centre and focal point are shifted, its radius is
    // not; a gradientTransform translate is moved into the points the same
    // way as the viewBox origin.
    for (focal, transform) in [
        (" fx='30002' fy='3'", ""),
        ("", " gradientTransform='translate(1 0)'"),
    ] {
        let tree = parse(&format!(
            r##"<svg viewBox="30000 0 10 10"><defs><radialGradient id="g" gradientUnits="userSpaceOnUse"
                  cx="30005" cy="5" r="4"{focal}{transform}>{stops}</radialGradient></defs>
                  <rect x="30000" width="10" height="10" fill="url(#g)"/></svg>"##
        ));
        assert!(
            tree.warnings.is_empty(),
            "{focal}{transform}: {:?}",
            tree.warnings
        );
        let g = radial(&tree.paths[0]);
        let shift = if transform.is_empty() { 0.0 } else { 1.0 };
        assert!(
            close(g.cx, 5.0 + shift) && close(g.cy, 5.0) && close(g.cr, 4.0),
            "{g:?}"
        );
        let (fx, fy) = if focal.is_empty() {
            (5.0 + shift, 5.0)
        } else {
            (2.0, 3.0)
        };
        assert!(
            close(g.fx, fx) && close(g.fy, fy),
            "{focal}{transform}: {g:?}"
        );
        assert_eq!((g.transform[4], g.transform[5]), (0.0, 0.0));
    }
    // A small linear part makes the rebased points large (25 / 0.001 =
    // 2.5e4, past the 2e4 limit); the geometry as authored fits and is used.
    let tree = parse(&format!(
        r##"<svg viewBox="0 0 10 10"><defs><linearGradient id="g" gradientUnits="userSpaceOnUse"
              gradientTransform="scale(0.001)" x2="10000">{stops}</linearGradient></defs>
              <g transform="translate(25 0)"><rect x="-25" width="10" height="10" fill="url(#g)"/></g></svg>"##
    ));
    assert!(tree.warnings.is_empty(), "{:?}", tree.warnings);
    let g = linear(&tree.paths[0]);
    assert!(
        close(g.x2, 10_000.0) && close(g.transform[4], 25.0),
        "{g:?}"
    );
    // A singular gradientTransform has no inverse; its numbers are checked
    // as they are, and a zero scale is within the limit.
    let tree = parse(&format!(
        r##"<svg viewBox="0 0 10 10"><defs><linearGradient id="g" gradientUnits="userSpaceOnUse"
              gradientTransform="scale(0)" x2="10">{stops}</linearGradient></defs>
              <rect width="10" height="10" fill="url(#g)"/></svg>"##
    ));
    assert!(matches!(tree.paths[0].fill, Some(SvgPaint::Linear(_))));
}

#[test]
fn a_stroke_wider_than_the_limit_is_not_drawn_and_the_fill_is_kept() {
    // ViewBox 10 x 40: the stroke limit is 1e4, the smaller side's range.
    let line =
        parse("<svg viewBox='0 0 10 40'><line x2='1' stroke='#000' stroke-width='1e9'/></svg>");
    assert!(line.paths.is_empty(), "a line has no fill to keep");
    assert!(warned(&line, STROKE_DROPPED));
    let rect = parse(
        "<svg viewBox='0 0 10 40'><rect width='1' height='1' stroke='#000' stroke-width='1e9'/></svg>",
    );
    assert!(rect.paths[0].fill.is_some() && rect.paths[0].stroke.is_none());
    assert!(warned(&rect, STROKE_DROPPED));
    // A fill-only shape carries no stroke width and warns nothing.
    let fill =
        parse("<svg viewBox='0 0 10 40'><rect width='1' height='1' stroke-width='1e9'/></svg>");
    assert_eq!(fill.paths[0].stroke_width, 0.0);
    assert!(fill.warnings.is_empty(), "{:?}", fill.warnings);
}
