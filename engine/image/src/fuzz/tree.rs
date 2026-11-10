//! The limits every SVG tree the image crate accepts must keep, asserted by
//! all three image harnesses: on what `parse_svg` returns (`svg`), on an
//! SVG tree that `kind_from_bytes` accepted from image bytes (`raster`),
//! and on an SVG asset loaded from a params value (`source`).

use crate::geom::PathCmd;
use crate::svg::{MAX_GRADIENT_STOPS, RANGE_RATIO, VIEWBOX_MAX, VIEWBOX_MIN};
use crate::{GradientStop, SvgPaint, SvgPath, SvgTree};

#[cfg(test)]
mod tests;

/// Asserts the limits `parse_svg` documents on an accepted tree parsed
/// from `input_len` bytes of markup.
///
/// The path-command count is at most `input_len`. A run of `z` gives one
/// `Close` per byte. One arc segment gives at most 11 cubics
/// (`ARC_TOLERANCE_RATIO` in `svg/path.rs`), and more than 7 cubics only
/// with a radius over about 10,000 units, which takes 3 bytes (`2e4`);
/// with the other six numbers and the separators they need, such an arc
/// takes at least 13 bytes of path data, and any arc takes at least 11
/// bytes. The parser has no element that repeats other markup (`<use>`,
/// `<symbol>`, `<pattern>` and `<marker>` are skipped with a warning, and
/// `<defs>` is never drawn), so no short element expands into a long path.
///
/// # Panics
///
/// Panics when a limit fails; the message names it.
pub(crate) fn assert_tree(tree: &SvgTree, input_len: usize) {
    let size_ok = |v: f64| (VIEWBOX_MIN..=VIEWBOX_MAX).contains(&v);
    assert!(
        size_ok(tree.width) && size_ok(tree.height),
        "the viewBox size {}x{} is outside the accepted limits",
        tree.width,
        tree.height
    );
    let commands: usize = tree.paths.iter().map(|p| p.cmds.len()).sum();
    assert!(
        commands <= input_len,
        "{commands} path commands from {input_len} bytes of markup"
    );
    let range = (RANGE_RATIO * tree.width, RANGE_RATIO * tree.height);
    for path in &tree.paths {
        assert_path(path, range);
    }
    for (i, warning) in tree.warnings.iter().enumerate() {
        assert!(
            !tree.warnings[..i].contains(warning),
            "the warning `{warning}` is listed twice"
        );
    }
}

/// Asserts one emitted path against the coordinate `range` (largest `|x|`,
/// largest `|y|`).
fn assert_path(path: &SvgPath, range: (f64, f64)) {
    assert!(!path.cmds.is_empty(), "an emitted path has no commands");
    for cmd in &path.cmds {
        for (x, y) in points(cmd) {
            assert!(
                x.is_finite() && y.is_finite() && x.abs() <= range.0 && y.abs() <= range.1,
                "the path point ({x}, {y}) is outside the coordinate range {range:?}"
            );
        }
    }
    match path.stroke {
        Some(color) => {
            assert_color(color);
            let limit = range.0.min(range.1);
            assert!(
                (0.0..=limit).contains(&path.stroke_width),
                "the stroke width {} is outside 0..={limit}",
                path.stroke_width
            );
        }
        None => assert!(
            path.stroke_width == 0.0,
            "a path without a stroke carries the width {}",
            path.stroke_width
        ),
    }
    match &path.fill {
        Some(SvgPaint::Solid(color)) => assert_color(*color),
        Some(SvgPaint::Linear(g)) => {
            assert_gradient(&[g.x1, g.y1, g.x2, g.y2], &g.transform, &g.stops, range);
        }
        Some(SvgPaint::Radial(g)) => assert_gradient(
            &[g.cx, g.cy, g.cr, g.fx, g.fy, g.fr],
            &g.transform,
            &g.stops,
            range,
        ),
        None => assert!(
            path.stroke.is_some(),
            "an emitted path has neither a fill nor a stroke"
        ),
    }
}

/// The points of one command: none for `Close`.
fn points(cmd: &PathCmd) -> Vec<(f64, f64)> {
    match *cmd {
        PathCmd::MoveTo(x, y) | PathCmd::LineTo(x, y) => vec![(x, y)],
        PathCmd::CurveTo(x1, y1, x2, y2, x, y) => vec![(x1, y1), (x2, y2), (x, y)],
        PathCmd::Close => Vec::new(),
    }
}

/// Asserts a gradient's numbers against twice the larger coordinate range,
/// and its stops: 1 to `MAX_GRADIENT_STOPS` of them, offsets in `0..=1`
/// and non-decreasing, colors and opacities in `0..=1`.
fn assert_gradient(
    numbers: &[f64],
    transform: &[f64; 6],
    stops: &[GradientStop],
    range: (f64, f64),
) {
    let limit = 2.0 * range.0.max(range.1);
    for &v in numbers.iter().chain(transform) {
        assert!(
            v.is_finite() && v.abs() <= limit,
            "the gradient number {v} is over the gradient limit {limit}"
        );
    }
    assert!(
        (1..=MAX_GRADIENT_STOPS).contains(&stops.len()),
        "a gradient has {} stops",
        stops.len()
    );
    let mut previous = 0.0_f32;
    for stop in stops {
        assert!(
            (previous..=1.0).contains(&stop.offset),
            "the stop offset {} is outside {previous}..=1",
            stop.offset
        );
        previous = stop.offset;
        assert_color(stop.color);
        assert!(
            (0.0..=1.0).contains(&stop.opacity),
            "the stop opacity {} is outside 0..=1",
            stop.opacity
        );
    }
}

/// Asserts each channel of an RGB color is in `0..=1`.
fn assert_color((r, g, b): (f32, f32, f32)) {
    for channel in [r, g, b] {
        assert!(
            (0.0..=1.0).contains(&channel),
            "the color channel {channel} is outside 0..=1"
        );
    }
}
