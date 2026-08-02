//! SVG subset parsing: markup -> flattened solid-color path list.
//!
//! Shojiku deliberately does not use resvg/usvg: they are MPL-2.0
//! licensed and their text stack pulls the unmaintained ttf-parser, both
//! of which `engine/deny.toml` rejects. Slip/invoice assets (logos,
//! stamps, QR codes) need only a small vector subset, parsed here with
//! roxmltree + svgtypes: `g/path/rect/circle/ellipse/line/polyline/
//! polygon`, `transform`, and solid `fill`/`stroke`. Transforms are
//! flattened into viewBox coordinates at parse time, so renderers only
//! scale the finished tree into the target box (they never re-measure).
//! Unsupported features degrade to deduplicated warnings the caller can
//! surface as diagnostics.

use crate::error::ImageError;
use crate::geom::PathCmd;
use std::str::FromStr;
use svgtypes::{Length, LengthUnit, ViewBox};

mod gradient;
mod paint;
mod path;
mod style;
#[cfg(test)]
mod tests;
mod walk;

pub use paint::{
    GradientStop, GradientTransform, LinearGradient, RadialGradient, SpreadMode, SvgPaint,
};

use style::{Affine, PaintRef, Style};
use walk::ParseCtx;

/// Caps applied while parsing untrusted SVG markup.
#[derive(Debug, Clone)]
pub struct SvgLimits {
    /// Maximum number of XML elements visited.
    pub max_nodes: usize,
    /// Maximum group nesting depth.
    pub max_depth: usize,
}

impl Default for SvgLimits {
    fn default() -> Self {
        Self {
            max_nodes: 10_000,
            max_depth: 32,
        }
    }
}

/// A styled, flattened path.
#[derive(Debug, Clone)]
pub struct SvgPath {
    /// Drawing commands in viewBox coordinates.
    pub cmds: Vec<PathCmd>,
    /// Fill paint (solid or gradient, in viewBox coordinates), if any.
    pub fill: Option<SvgPaint>,
    /// Solid stroke color (0..=1 RGB), if any.
    pub stroke: Option<(f32, f32, f32)>,
    /// Stroke width in viewBox units.
    pub stroke_width: f64,
}

/// A parsed SVG document reduced to solid-color paths.
#[derive(Debug, Clone)]
pub struct SvgTree {
    /// ViewBox width (always > 0).
    pub width: f64,
    /// ViewBox height (always > 0).
    pub height: f64,
    /// Paths in document order.
    pub paths: Vec<SvgPath>,
    /// Unsupported-feature notes, deduplicated.
    pub warnings: Vec<String>,
}

/// Parses SVG markup into an [`SvgTree`], enforcing `limits`.
pub fn parse_svg(text: &str, limits: &SvgLimits) -> Result<SvgTree, ImageError> {
    let doc = roxmltree::Document::parse(text).map_err(|e| ImageError::Svg(format!("xml: {e}")))?;
    let root = doc.root_element();
    if root.tag_name().name() != "svg" {
        return Err(ImageError::Svg(format!(
            "root element is <{}>, expected <svg>",
            root.tag_name().name()
        )));
    }
    let (min_x, min_y, width, height) = svg_size(&root)?;
    let mut warnings = Warnings(Vec::new());
    let gradients = gradient::collect(&doc, &mut warnings);
    let mut ctx = ParseCtx {
        warnings,
        nodes: 0,
        limits,
        gradients,
        view: (width, height),
    };
    let mut paths = Vec::new();
    let base = Affine::translate(-min_x, -min_y);
    let style = Style {
        fill: Some(PaintRef::Solid((0.0, 0.0, 0.0))),
        stroke: None,
        stroke_width: 1.0,
    };
    ctx.walk_children(&root, &base, &style, 0, &mut paths)?;
    Ok(SvgTree {
        width,
        height,
        paths,
        warnings: ctx.warnings.0,
    })
}

/// Resolves the document coordinate space: viewBox, else width/height.
fn svg_size(root: &roxmltree::Node) -> Result<(f64, f64, f64, f64), ImageError> {
    if let Some(raw) = root.attribute("viewBox") {
        // svgtypes rejects non-finite numbers and w/h <= 0 itself.
        let vb = ViewBox::from_str(raw).map_err(|e| ImageError::Svg(format!("viewBox: {e}")))?;
        return Ok((vb.x, vb.y, vb.w, vb.h));
    }
    let w = parse_dimension(root.attribute("width"))?;
    let h = parse_dimension(root.attribute("height"))?;
    Ok((0.0, 0.0, w, h))
}

/// Parses a width/height attribute; only unitless/px lengths make sense
/// for an embedded asset.
fn parse_dimension(attr: Option<&str>) -> Result<f64, ImageError> {
    let raw = attr
        .ok_or_else(|| ImageError::Svg("svg has neither viewBox nor width/height".to_string()))?;
    let len = Length::from_str(raw).map_err(|e| ImageError::Svg(format!("length `{raw}`: {e}")))?;
    if !matches!(len.unit, LengthUnit::None | LengthUnit::Px) {
        return Err(ImageError::Svg(format!("unsupported unit in `{raw}`")));
    }
    if !(len.number.is_finite() && len.number > 0.0) {
        return Err(ImageError::Svg(format!("`{raw}` is not a positive size")));
    }
    Ok(len.number)
}

/// Warning list with de-duplication (one note per distinct message).
struct Warnings(Vec<String>);

impl Warnings {
    fn push(&mut self, msg: &str) {
        if !self.0.iter().any(|w| w == msg) {
            self.0.push(msg.to_string());
        }
    }
}
