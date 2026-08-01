//! The element walk: group/shape traversal with node and depth caps,
//! emitting solid-color paths.

use crate::error::ImageError;
use crate::geom::PathCmd;
use svgtypes::PointsParser;

use super::gradient::{self, GradientMap};
use super::paint::SvgPaint;
use super::path::{parse_path_data, PathSink};
use super::style::{attr_num, parse_transform, Affine, PaintRef, Style};
use super::{SvgLimits, SvgPath, Warnings};

pub(super) struct ParseCtx<'l> {
    pub(super) warnings: Warnings,
    pub(super) nodes: usize,
    pub(super) limits: &'l SvgLimits,
    pub(super) gradients: GradientMap,
    /// ViewBox `(width, height)`, for `%` coordinates under userSpaceOnUse.
    pub(super) view: (f64, f64),
}

impl ParseCtx<'_> {
    pub(super) fn walk_children(
        &mut self,
        parent: &roxmltree::Node,
        ctm: &Affine,
        style: &Style,
        depth: usize,
        out: &mut Vec<SvgPath>,
    ) -> Result<(), ImageError> {
        if depth > self.limits.max_depth {
            return Err(ImageError::Svg(format!(
                "nesting exceeds {} levels",
                self.limits.max_depth
            )));
        }
        for node in parent.children().filter(roxmltree::Node::is_element) {
            self.nodes += 1;
            if self.nodes > self.limits.max_nodes {
                return Err(ImageError::Svg(format!(
                    "more than {} elements",
                    self.limits.max_nodes
                )));
            }
            let ctm = match node.attribute("transform") {
                Some(raw) => ctm.then(&parse_transform(raw, &mut self.warnings)),
                None => *ctm,
            };
            let style = style.updated(&node, &mut self.warnings);
            match node.tag_name().name() {
                "g" => self.walk_children(&node, &ctm, &style, depth + 1, out)?,
                "path" => {
                    if let Some(d) = node.attribute("d") {
                        let cmds = parse_path_data(d, &ctm, &mut self.warnings);
                        self.push_path(cmds, &style, &ctm, out);
                    }
                }
                "rect" => {
                    self.rect(&node, &ctm, &style, out);
                }
                "circle" => {
                    let r = attr_num(&node, "r", 0.0, &mut self.warnings);
                    self.ellipse_shape(&node, r, r, &ctm, &style, out);
                }
                "ellipse" => {
                    let rx = attr_num(&node, "rx", 0.0, &mut self.warnings);
                    let ry = attr_num(&node, "ry", 0.0, &mut self.warnings);
                    self.ellipse_shape(&node, rx, ry, &ctm, &style, out);
                }
                "line" => {
                    let x1 = attr_num(&node, "x1", 0.0, &mut self.warnings);
                    let y1 = attr_num(&node, "y1", 0.0, &mut self.warnings);
                    let x2 = attr_num(&node, "x2", 0.0, &mut self.warnings);
                    let y2 = attr_num(&node, "y2", 0.0, &mut self.warnings);
                    let mut sink = PathSink::new(&ctm);
                    sink.move_to((x1, y1));
                    sink.line_to((x2, y2));
                    // Lines are stroke-only by definition.
                    let line_style = Style {
                        fill: None,
                        stroke: style.stroke,
                        stroke_width: style.stroke_width,
                    };
                    self.push_path(sink.cmds, &line_style, &ctm, out);
                }
                "polyline" | "polygon" => {
                    let points: Vec<(f64, f64)> = node
                        .attribute("points")
                        .map(|raw| PointsParser::from(raw).collect())
                        .unwrap_or_default();
                    if let Some((&first, rest)) = points.split_first() {
                        let mut sink = PathSink::new(&ctm);
                        sink.move_to(first);
                        for &point in rest {
                            sink.line_to(point);
                        }
                        if node.tag_name().name() == "polygon" {
                            sink.close();
                        }
                        self.push_path(sink.cmds, &style, &ctm, out);
                    }
                }
                // Definition elements are consumed by gradient collection,
                // not rendered directly.
                "defs" | "linearGradient" | "radialGradient" => {}
                other => {
                    self.warnings
                        .push(&format!("unsupported element <{other}> skipped"));
                }
            }
        }
        Ok(())
    }

    fn rect(
        &mut self,
        node: &roxmltree::Node,
        ctm: &Affine,
        style: &Style,
        out: &mut Vec<SvgPath>,
    ) {
        let x = attr_num(node, "x", 0.0, &mut self.warnings);
        let y = attr_num(node, "y", 0.0, &mut self.warnings);
        let w = attr_num(node, "width", 0.0, &mut self.warnings);
        let h = attr_num(node, "height", 0.0, &mut self.warnings);
        if w <= 0.0 || h <= 0.0 {
            return;
        }
        if node.has_attribute("rx") || node.has_attribute("ry") {
            self.warnings.push("rounded rect corners are drawn square");
        }
        let mut sink = PathSink::new(ctm);
        sink.move_to((x, y));
        sink.line_to((x + w, y));
        sink.line_to((x + w, y + h));
        sink.line_to((x, y + h));
        sink.close();
        self.push_path(sink.cmds, style, ctm, out);
    }

    fn ellipse_shape(
        &mut self,
        node: &roxmltree::Node,
        rx: f64,
        ry: f64,
        ctm: &Affine,
        style: &Style,
        out: &mut Vec<SvgPath>,
    ) {
        if rx <= 0.0 || ry <= 0.0 {
            return;
        }
        let cx = attr_num(node, "cx", 0.0, &mut self.warnings);
        let cy = attr_num(node, "cy", 0.0, &mut self.warnings);
        // Standard 4-arc cubic approximation of an ellipse.
        const KAPPA: f64 = 0.552_284_749_830_793_4;
        let (kx, ky) = (rx * KAPPA, ry * KAPPA);
        let mut sink = PathSink::new(ctm);
        sink.move_to((cx + rx, cy));
        sink.curve_to((cx + rx, cy + ky), (cx + kx, cy + ry), (cx, cy + ry));
        sink.curve_to((cx - kx, cy + ry), (cx - rx, cy + ky), (cx - rx, cy));
        sink.curve_to((cx - rx, cy - ky), (cx - kx, cy - ry), (cx, cy - ry));
        sink.curve_to((cx + kx, cy - ry), (cx + rx, cy - ky), (cx + rx, cy));
        sink.close();
        self.push_path(sink.cmds, style, ctm, out);
    }

    /// Keeps a path only when it is visible and non-empty, resolving a
    /// gradient fill against the path's bounding box.
    fn push_path(
        &mut self,
        cmds: Vec<PathCmd>,
        style: &Style,
        ctm: &Affine,
        out: &mut Vec<SvgPath>,
    ) {
        if cmds.is_empty() {
            return;
        }
        let fill = self.resolve_fill(style.fill.as_ref(), &cmds, ctm);
        if fill.is_none() && style.stroke.is_none() {
            return;
        }
        out.push(SvgPath {
            cmds,
            fill,
            stroke: style.stroke,
            stroke_width: style.stroke_width,
        });
    }

    /// Resolves a fill reference to concrete paint (a gradient needs the
    /// path's bounding box for `objectBoundingBox` units).
    fn resolve_fill(
        &mut self,
        fill: Option<&PaintRef>,
        cmds: &[PathCmd],
        ctm: &Affine,
    ) -> Option<SvgPaint> {
        match fill? {
            PaintRef::Solid(color) => Some(SvgPaint::Solid(*color)),
            PaintRef::Gradient(id) => {
                let bbox = path_bbox(cmds);
                gradient::resolve(
                    &self.gradients,
                    id,
                    ctm,
                    bbox,
                    self.view,
                    &mut self.warnings,
                )
            }
        }
    }
}

/// Axis-aligned bounding box `(min_x, min_y, w, h)` over a path's points
/// (anchors and control points); `None` when the path has no points.
fn path_bbox(cmds: &[PathCmd]) -> Option<(f64, f64, f64, f64)> {
    let mut bounds: Option<(f64, f64, f64, f64)> = None;
    let mut add = |x: f64, y: f64| {
        bounds = Some(match bounds {
            None => (x, y, x, y),
            Some((lx, ly, hx, hy)) => (lx.min(x), ly.min(y), hx.max(x), hy.max(y)),
        });
    };
    for cmd in cmds {
        match *cmd {
            PathCmd::MoveTo(x, y) | PathCmd::LineTo(x, y) => add(x, y),
            PathCmd::CurveTo(x1, y1, x2, y2, x, y) => {
                add(x1, y1);
                add(x2, y2);
                add(x, y);
            }
            PathCmd::Close => {}
        }
    }
    bounds.map(|(lx, ly, hx, hy)| (lx, ly, hx - lx, hy - ly))
}
