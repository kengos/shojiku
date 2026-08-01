//! Glyph-outline collector: turns a skrifa outline into the tree's
//! [`PathCmd`]s, flipping y-up font space into y-down layout space and
//! elevating TrueType quadratics to cubics (the tree carries only cubics).

use shojiku_image::PathCmd;
use skrifa::outline::OutlinePen;

/// Collects a skrifa outline into [`PathCmd`]s, flipping y-up font space
/// into the y-down layout space and elevating quadratics to cubics (the
/// tree carries only cubics).
#[derive(Default)]
pub(in crate::font) struct PathPen {
    pub(in crate::font) cmds: Vec<PathCmd>,
    /// Current point, kept for the exact quadratic->cubic elevation.
    cur: (f64, f64),
}

impl OutlinePen for PathPen {
    fn move_to(&mut self, x: f32, y: f32) {
        self.cur = (f64::from(x), f64::from(-y));
        self.cmds.push(PathCmd::MoveTo(self.cur.0, self.cur.1));
    }

    fn line_to(&mut self, x: f32, y: f32) {
        self.cur = (f64::from(x), f64::from(-y));
        self.cmds.push(PathCmd::LineTo(self.cur.0, self.cur.1));
    }

    fn quad_to(&mut self, cx: f32, cy: f32, x: f32, y: f32) {
        let (x0, y0) = self.cur;
        let ctrl = (f64::from(cx), f64::from(-cy));
        let end = (f64::from(x), f64::from(-y));
        // Degree elevation: cubic controls at 1/3 and 2/3 toward the quad
        // control point.
        let c1 = (
            x0 + 2.0 / 3.0 * (ctrl.0 - x0),
            y0 + 2.0 / 3.0 * (ctrl.1 - y0),
        );
        let c2 = (
            end.0 + 2.0 / 3.0 * (ctrl.0 - end.0),
            end.1 + 2.0 / 3.0 * (ctrl.1 - end.1),
        );
        self.cmds
            .push(PathCmd::CurveTo(c1.0, c1.1, c2.0, c2.1, end.0, end.1));
        self.cur = end;
    }

    fn curve_to(&mut self, cx0: f32, cy0: f32, cx1: f32, cy1: f32, x: f32, y: f32) {
        let end = (f64::from(x), f64::from(-y));
        self.cmds.push(PathCmd::CurveTo(
            f64::from(cx0),
            f64::from(-cy0),
            f64::from(cx1),
            f64::from(-cy1),
            end.0,
            end.1,
        ));
        self.cur = end;
    }

    fn close(&mut self) {
        self.cmds.push(PathCmd::Close);
    }
}

#[cfg(test)]
mod tests {
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
}
