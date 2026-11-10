//! Unit tests for the tree limits: a tree within every limit passes, and
//! each limit fails on a hand-built tree that breaks only that limit.

use super::*;
use crate::{LinearGradient, RadialGradient, SpreadMode};

/// A 10x10 tree with one filled square: within every limit.
fn tree() -> SvgTree {
    SvgTree {
        width: 10.0,
        height: 10.0,
        paths: vec![SvgPath {
            cmds: vec![
                PathCmd::MoveTo(0.0, 0.0),
                PathCmd::LineTo(10.0, 0.0),
                PathCmd::CurveTo(10.0, 5.0, 10.0, 5.0, 10.0, 10.0),
                PathCmd::Close,
            ],
            fill: Some(SvgPaint::Solid((0.0, 0.5, 1.0))),
            stroke: None,
            stroke_width: 0.0,
        }],
        warnings: vec!["a".to_string(), "b".to_string()],
    }
}

/// One opaque stop at `offset`.
fn stop(offset: f32) -> GradientStop {
    GradientStop {
        offset,
        color: (1.0, 0.0, 0.0),
        opacity: 1.0,
    }
}

/// A linear gradient from `(0, 0)` to `(x2, 0)` with `stops`.
fn linear(x2: f64, stops: Vec<GradientStop>) -> SvgPaint {
    SvgPaint::Linear(LinearGradient {
        x1: 0.0,
        y1: 0.0,
        x2,
        y2: 0.0,
        transform: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        spread: SpreadMode::Pad,
        stops,
    })
}

/// [`tree`] with its one path changed by `edit`.
fn tree_with(edit: impl FnOnce(&mut SvgPath)) -> SvgTree {
    let mut t = tree();
    edit(&mut t.paths[0]);
    t
}

#[test]
fn a_tree_within_every_limit_passes() {
    assert_tree(&tree(), 4);
    let stroked = tree_with(|p| {
        p.fill = None;
        p.stroke = Some((0.0, 0.0, 0.0));
        p.stroke_width = 10_000.0;
    });
    assert_tree(&stroked, 4);
    let radial = tree_with(|p| {
        p.fill = Some(SvgPaint::Radial(RadialGradient {
            fx: 5.0,
            fy: 5.0,
            fr: 0.0,
            cx: 5.0,
            cy: 5.0,
            cr: 20_000.0,
            transform: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            spread: SpreadMode::Reflect,
            stops: vec![stop(0.0), stop(0.5), stop(0.5), stop(1.0)],
        }));
    });
    assert_tree(&radial, 4);
}

#[test]
#[should_panic(expected = "outside the accepted limits")]
fn a_viewbox_below_the_minimum_fails() {
    let mut t = tree();
    t.width = 0.0005;
    assert_tree(&t, 4);
}

#[test]
#[should_panic(expected = "outside the accepted limits")]
fn a_viewbox_above_the_maximum_fails() {
    let mut t = tree();
    t.height = 2e6;
    assert_tree(&t, 4);
}

#[test]
#[should_panic(expected = "4 path commands from 3 bytes")]
fn more_commands_than_input_bytes_fail() {
    assert_tree(&tree(), 3);
}

#[test]
#[should_panic(expected = "outside the coordinate range")]
fn a_point_outside_the_coordinate_range_fails() {
    assert_tree(
        &tree_with(|p| p.cmds[1] = PathCmd::LineTo(10_000.5, 0.0)),
        4,
    );
}

#[test]
#[should_panic(expected = "outside the coordinate range")]
fn a_control_point_outside_the_coordinate_range_fails() {
    let cmd = PathCmd::CurveTo(0.0, -10_001.0, 0.0, 0.0, 0.0, 0.0);
    assert_tree(&tree_with(|p| p.cmds[2] = cmd), 4);
}

#[test]
#[should_panic(expected = "outside the coordinate range")]
fn a_non_finite_point_fails() {
    assert_tree(
        &tree_with(|p| p.cmds[0] = PathCmd::MoveTo(f64::NAN, 0.0)),
        4,
    );
}

#[test]
#[should_panic(expected = "has no commands")]
fn an_empty_path_fails() {
    assert_tree(&tree_with(|p| p.cmds.clear()), 4);
}

#[test]
#[should_panic(expected = "the stroke width 10000.5 is outside")]
fn a_stroke_wider_than_the_limit_fails() {
    let t = tree_with(|p| {
        p.stroke = Some((0.0, 0.0, 0.0));
        p.stroke_width = 10_000.5;
    });
    assert_tree(&t, 4);
}

#[test]
#[should_panic(expected = "a path without a stroke carries the width 1")]
fn a_width_without_a_stroke_fails() {
    assert_tree(&tree_with(|p| p.stroke_width = 1.0), 4);
}

#[test]
#[should_panic(expected = "the color channel 1.5 is outside")]
fn a_color_channel_over_one_fails() {
    assert_tree(
        &tree_with(|p| p.fill = Some(SvgPaint::Solid((1.5, 0.0, 0.0)))),
        4,
    );
}

#[test]
#[should_panic(expected = "neither a fill nor a stroke")]
fn a_path_with_no_paint_fails() {
    assert_tree(&tree_with(|p| p.fill = None), 4);
}

#[test]
#[should_panic(expected = "over the gradient limit 20000")]
fn a_gradient_number_over_the_gradient_limit_fails() {
    assert_tree(
        &tree_with(|p| p.fill = Some(linear(20_000.5, vec![stop(0.0)]))),
        4,
    );
}

#[test]
#[should_panic(expected = "a gradient has 0 stops")]
fn a_gradient_with_no_stop_fails() {
    assert_tree(&tree_with(|p| p.fill = Some(linear(1.0, Vec::new()))), 4);
}

#[test]
#[should_panic(expected = "a gradient has 257 stops")]
fn a_gradient_over_the_stop_cap_fails() {
    let stops = vec![stop(1.0); MAX_GRADIENT_STOPS + 1];
    assert_tree(&tree_with(|p| p.fill = Some(linear(1.0, stops))), 4);
}

#[test]
#[should_panic(expected = "the stop offset 0.25 is outside 0.5..=1")]
fn a_decreasing_stop_offset_fails() {
    let stops = vec![stop(0.5), stop(0.25)];
    assert_tree(&tree_with(|p| p.fill = Some(linear(1.0, stops))), 4);
}

#[test]
#[should_panic(expected = "the stop opacity -0.5 is outside")]
fn a_stop_opacity_below_zero_fails() {
    let mut faint = stop(0.0);
    faint.opacity = -0.5;
    assert_tree(&tree_with(|p| p.fill = Some(linear(1.0, vec![faint]))), 4);
}

#[test]
#[should_panic(expected = "the warning `a` is listed twice")]
fn a_repeated_warning_fails() {
    let mut t = tree();
    t.warnings.push("a".to_string());
    assert_tree(&t, 4);
}
