//! SVG presentation state: affine transforms, inheritable style
//! attributes, and their parsers.

use std::str::FromStr;
use svgtypes::{Color, Length, LengthUnit, TransformListParser, TransformListToken};

use super::Warnings;

/// 2D affine transform (column-major `a b c d e f`, SVG convention).
#[derive(Debug, Clone, Copy)]
pub(super) struct Affine {
    a: f64,
    b: f64,
    c: f64,
    d: f64,
    e: f64,
    f: f64,
}

impl Affine {
    pub(super) const IDENTITY: Affine = Affine {
        a: 1.0,
        b: 0.0,
        c: 0.0,
        d: 1.0,
        e: 0.0,
        f: 0.0,
    };

    pub(super) fn translate(tx: f64, ty: f64) -> Affine {
        Affine {
            e: tx,
            f: ty,
            ..Affine::IDENTITY
        }
    }

    /// `self ∘ other`: applies `other` first, then `self`.
    pub(super) fn then(&self, o: &Affine) -> Affine {
        Affine {
            a: self.a * o.a + self.c * o.b,
            b: self.b * o.a + self.d * o.b,
            c: self.a * o.c + self.c * o.d,
            d: self.b * o.c + self.d * o.d,
            e: self.a * o.e + self.c * o.f + self.e,
            f: self.b * o.e + self.d * o.f + self.f,
        }
    }

    pub(super) fn apply(&self, x: f64, y: f64) -> (f64, f64) {
        (
            self.a * x + self.c * y + self.e,
            self.b * x + self.d * y + self.f,
        )
    }

    /// Builds an affine from its six components (`a b c d e f`).
    pub(super) fn from_row(a: f64, b: f64, c: f64, d: f64, e: f64, f: f64) -> Affine {
        Affine { a, b, c, d, e, f }
    }

    /// The six components in SVG column-major order (`a b c d e f`).
    pub(super) fn to_row(self) -> [f64; 6] {
        [self.a, self.b, self.c, self.d, self.e, self.f]
    }
}

/// A fill reference: a flat color or a gradient paint server (`url(#id)`,
/// resolved later against the document's gradient table).
#[derive(Debug, Clone)]
pub(super) enum PaintRef {
    Solid((f32, f32, f32)),
    Gradient(String),
}

/// Inheritable presentation attributes (the supported subset).
#[derive(Debug, Clone)]
pub(super) struct Style {
    pub(super) fill: Option<PaintRef>,
    pub(super) stroke: Option<(f32, f32, f32)>,
    pub(super) stroke_width: f64,
}

impl Style {
    /// Child style: this element's attributes over the inherited values.
    pub(super) fn updated(&self, node: &roxmltree::Node, warnings: &mut Warnings) -> Style {
        let mut style = self.clone();
        if let Some(raw) = node.attribute("fill") {
            if let Some(paint) = parse_fill(raw, warnings) {
                style.fill = paint;
            }
        }
        if let Some(raw) = node.attribute("stroke") {
            if let Some(paint) = parse_stroke(raw, warnings) {
                style.stroke = paint;
            }
        }
        if let Some(raw) = node.attribute("stroke-width") {
            match parse_stroke_width(raw) {
                Some(width) => style.stroke_width = width,
                None => warnings.push(&format!("invalid stroke-width `{raw}` ignored")),
            }
        }
        for name in [
            "style",
            "opacity",
            "fill-opacity",
            "stroke-opacity",
            "clip-path",
            "mask",
            "filter",
        ] {
            if node.has_attribute(name) {
                warnings.push(&format!("unsupported attribute `{name}` ignored"));
            }
        }
        style
    }
}

/// Parses a `fill` value into a [`PaintRef`]. `Some(paint)` overrides the
/// inherited value; `None` (unparseable) keeps it. Recognizes solid
/// colors, `none`, and `url(#id)` gradient references.
fn parse_fill(raw: &str, warnings: &mut Warnings) -> Option<Option<PaintRef>> {
    let value = raw.trim();
    if value == "none" {
        return Some(None);
    }
    if let Some(id) = gradient_ref_id(value) {
        return Some(Some(PaintRef::Gradient(id)));
    }
    match parse_color(value, warnings) {
        Some(color) => Some(Some(PaintRef::Solid(color))),
        None => {
            warnings.push(&format!("unsupported paint `{value}` ignored"));
            None
        }
    }
}

/// Parses a `stroke` value. Gradient strokes are unsupported: they warn
/// and keep the inherited stroke (v1 draws stroke as a solid only).
fn parse_stroke(raw: &str, warnings: &mut Warnings) -> Option<Option<(f32, f32, f32)>> {
    let value = raw.trim();
    if value == "none" {
        return Some(None);
    }
    if gradient_ref_id(value).is_some() {
        warnings.push("gradient stroke ignored");
        return None;
    }
    match parse_color(value, warnings) {
        Some(color) => Some(Some(color)),
        None => {
            warnings.push(&format!("unsupported paint `{value}` ignored"));
            None
        }
    }
}

/// Extracts `id` from a `url(#id)` paint reference, else `None`.
fn gradient_ref_id(value: &str) -> Option<String> {
    let inner = value.strip_prefix("url(")?.strip_suffix(')')?.trim();
    let id = inner.strip_prefix('#')?.trim();
    (!id.is_empty()).then(|| id.to_string())
}

/// Parses a solid color to `0..=1` RGB; warns on dropped alpha. `None`
/// when the value is not a recognizable color.
pub(super) fn parse_color(raw: &str, warnings: &mut Warnings) -> Option<(f32, f32, f32)> {
    let color = Color::from_str(raw.trim()).ok()?;
    if color.alpha != 255 {
        warnings.push("partial paint transparency ignored");
    }
    Some((
        f32::from(color.red) / 255.0,
        f32::from(color.green) / 255.0,
        f32::from(color.blue) / 255.0,
    ))
}

/// Parses a stroke width (unitless/px, non-negative and finite).
fn parse_stroke_width(raw: &str) -> Option<f64> {
    let len = Length::from_str(raw).ok()?;
    if !matches!(len.unit, LengthUnit::None | LengthUnit::Px) {
        return None;
    }
    (len.number.is_finite() && len.number >= 0.0).then_some(len.number)
}

/// Numeric attribute with a default; unitless/px lengths only. Invalid
/// values fall back to the default with a warning.
pub(super) fn attr_num(
    node: &roxmltree::Node,
    name: &str,
    default: f64,
    warnings: &mut Warnings,
) -> f64 {
    let Some(raw) = node.attribute(name) else { return default };
    match Length::from_str(raw) {
        Ok(len)
            if matches!(len.unit, LengthUnit::None | LengthUnit::Px) && len.number.is_finite() =>
        {
            len.number
        }
        _ => {
            warnings.push(&format!(
                "invalid `{name}` value `{raw}` treated as {default}"
            ));
            default
        }
    }
}

pub(super) fn parse_transform(raw: &str, warnings: &mut Warnings) -> Affine {
    let mut matrix = Affine::IDENTITY;
    for token in TransformListParser::from(raw) {
        let Ok(token) = token else {
            warnings.push(&format!("invalid transform `{raw}` truncated"));
            break;
        };
        let step = match token {
            TransformListToken::Matrix { a, b, c, d, e, f } => Affine { a, b, c, d, e, f },
            TransformListToken::Translate { tx, ty } => Affine::translate(tx, ty),
            TransformListToken::Scale { sx, sy } => Affine {
                a: sx,
                d: sy,
                ..Affine::IDENTITY
            },
            TransformListToken::Rotate { angle } => {
                let (sin, cos) = angle.to_radians().sin_cos();
                Affine {
                    a: cos,
                    b: sin,
                    c: -sin,
                    d: cos,
                    e: 0.0,
                    f: 0.0,
                }
            }
            TransformListToken::SkewX { angle } => Affine {
                c: angle.to_radians().tan(),
                ..Affine::IDENTITY
            },
            TransformListToken::SkewY { angle } => Affine {
                b: angle.to_radians().tan(),
                ..Affine::IDENTITY
            },
        };
        matrix = matrix.then(&step);
    }
    matrix
}
