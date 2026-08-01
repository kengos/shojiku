//! Parsing of a single gradient element and its `<stop>` children into the
//! owned [`GradientDef`] intermediate (no document lifetime kept).

use std::str::FromStr;
use svgtypes::{Length, LengthUnit};

use super::super::paint::{GradientStop, SpreadMode};
use super::super::style::{parse_color, parse_transform, Affine};
use super::super::Warnings;
use super::{Coord, GradientDef, Kind, Units};

/// Parses one `<linearGradient>`/`<radialGradient>`. Requires an `id` (an
/// unreferenceable gradient is dropped).
pub(super) fn parse_def(
    node: &roxmltree::Node,
    warnings: &mut Warnings,
) -> Option<(String, GradientDef)> {
    let id = node.attribute("id")?.to_string();
    let kind = match node.tag_name().name() {
        "linearGradient" => Kind::Linear {
            x1: coord(node, "x1", warnings),
            y1: coord(node, "y1", warnings),
            x2: coord(node, "x2", warnings),
            y2: coord(node, "y2", warnings),
        },
        _ => Kind::Radial {
            cx: coord(node, "cx", warnings),
            cy: coord(node, "cy", warnings),
            r: coord(node, "r", warnings),
            fx: coord(node, "fx", warnings),
            fy: coord(node, "fy", warnings),
        },
    };
    let def = GradientDef {
        kind,
        units: units(node, warnings),
        transform: node
            .attribute("gradientTransform")
            .map_or(Affine::IDENTITY, |raw| parse_transform(raw, warnings)),
        spread: spread(node, warnings),
        stops: parse_stops(node, warnings),
        href: href(node),
    };
    Some((id, def))
}

/// Parses the `<stop>` children in document order.
fn parse_stops(node: &roxmltree::Node, warnings: &mut Warnings) -> Vec<GradientStop> {
    node.children()
        .filter(|c| c.is_element() && c.tag_name().name() == "stop")
        .map(|stop| GradientStop {
            offset: coord(&stop, "offset", warnings).map_or(0.0, coord_fraction) as f32,
            color: prop(&stop, "stop-color")
                .and_then(|raw| parse_color(raw, warnings))
                .unwrap_or((0.0, 0.0, 0.0)),
            opacity: prop(&stop, "stop-opacity")
                .and_then(|raw| f32::from_str(raw.trim()).ok())
                .unwrap_or(1.0),
        })
        .collect()
}

/// An offset [`Coord`] as a `0..=1` fraction (`%` is already `/100`).
fn coord_fraction(c: Coord) -> f64 {
    match c {
        Coord::Num(n) | Coord::Pct(n) => n,
    }
}

/// Reads a stop property from the `prop=".."` attribute, falling back to a
/// `style="prop:..;.."` declaration (Inkscape writes stops that way).
fn prop<'a>(node: &'a roxmltree::Node, name: &str) -> Option<&'a str> {
    if let Some(v) = node.attribute(name) {
        return Some(v);
    }
    let style = node.attribute("style")?;
    style.split(';').find_map(|decl| {
        let (key, value) = decl.split_once(':')?;
        (key.trim() == name).then(|| value.trim())
    })
}

/// Parses a coordinate attribute; a present-but-invalid value warns and is
/// treated as absent (`None`, so the resolve-time default applies).
fn coord(node: &roxmltree::Node, name: &str, warnings: &mut Warnings) -> Option<Coord> {
    let raw = node.attribute(name)?;
    match Length::from_str(raw) {
        Ok(len) if len.number.is_finite() => match len.unit {
            LengthUnit::Percent => Some(Coord::Pct(len.number / 100.0)),
            LengthUnit::None | LengthUnit::Px => Some(Coord::Num(len.number)),
            _ => {
                warnings.push(&format!("unsupported unit in gradient `{name}` ignored"));
                None
            }
        },
        _ => {
            warnings.push(&format!("invalid gradient `{name}` `{raw}` ignored"));
            None
        }
    }
}

fn units(node: &roxmltree::Node, warnings: &mut Warnings) -> Units {
    match node.attribute("gradientUnits") {
        None | Some("objectBoundingBox") => Units::Bbox,
        Some("userSpaceOnUse") => Units::User,
        Some(other) => {
            warnings.push(&format!(
                "unsupported gradientUnits `{other}` -> objectBoundingBox"
            ));
            Units::Bbox
        }
    }
}

fn spread(node: &roxmltree::Node, warnings: &mut Warnings) -> SpreadMode {
    match node.attribute("spreadMethod") {
        None | Some("pad") => SpreadMode::Pad,
        Some("reflect") => SpreadMode::Reflect,
        Some("repeat") => SpreadMode::Repeat,
        Some(other) => {
            warnings.push(&format!("unsupported spreadMethod `{other}` -> pad"));
            SpreadMode::Pad
        }
    }
}

/// The `href`/`xlink:href` target id (local attribute name, either
/// namespace), stripped of its leading `#`.
fn href(node: &roxmltree::Node) -> Option<String> {
    let raw = node.attributes().find(|a| a.name() == "href")?.value();
    raw.strip_prefix('#').map(str::to_string)
}
