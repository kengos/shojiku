//! Unit tests for the glyph-outline collector.

use super::*;

#[test]
fn pen_flips_y_and_elevates_quadratics_and_cubics() {
    let mut pen = PathPen::default();
    pen.move_to(0.0, 10.0);
    pen.line_to(4.0, 6.0);
    // Quadratic: control at (4, 4), end at (8, 0).
    pen.quad_to(4.0, 4.0, 8.0, 0.0);
    // Cubic passes straight through (y flipped).
    pen.curve_to(1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
    pen.close();
    // y is negated on every command.
    assert_eq!(pen.cmds[0], PathCmd::MoveTo(0.0, -10.0));
    assert_eq!(pen.cmds[1], PathCmd::LineTo(4.0, -6.0));
    // Quad elevated to cubic: from (4,-6), ctrl (4,-4), end (8,0).
    let PathCmd::CurveTo(c1x, c1y, c2x, c2y, ex, ey) = pen.cmds[2] else { panic!("cubic") };
    assert!((c1x - (4.0 + 2.0 / 3.0 * 0.0)).abs() < 1e-9);
    assert!((c1y - (-6.0 + 2.0 / 3.0 * (-4.0 - -6.0))).abs() < 1e-9);
    assert!((c2x - (8.0 + 2.0 / 3.0 * (4.0 - 8.0))).abs() < 1e-9);
    assert!((c2y - (0.0 + 2.0 / 3.0 * (-4.0 - 0.0))).abs() < 1e-9);
    assert_eq!((ex, ey), (8.0, 0.0));
    assert_eq!(
        pen.cmds[3],
        PathCmd::CurveTo(1.0, -2.0, 3.0, -4.0, 5.0, -6.0)
    );
    assert_eq!(pen.cmds[4], PathCmd::Close);
}
