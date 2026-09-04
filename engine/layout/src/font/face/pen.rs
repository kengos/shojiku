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
mod tests;
