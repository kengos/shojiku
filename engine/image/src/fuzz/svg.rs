//! The SVG harness the `image_svg` fuzz target and the corpus replay test
//! both run.
//!
//! [`parse_svg`] returns a tree within these limits, so that the renderers
//! can draw it in `f32`: a viewBox from `VIEWBOX_MIN` to `VIEWBOX_MAX` per
//! side, every path coordinate finite and at most `RANGE_RATIO` viewBox
//! widths (x) or heights (y) from the viewBox origin, a stroke width at
//! most `RANGE_RATIO` times the smaller viewBox side, and every gradient
//! number at most twice the larger of the two coordinate ranges. The
//! harness parses the markup under the default [`SvgLimits`] and asserts
//! those limits on every accepted tree, together with the paint ranges, a
//! path-command count bounded by the input length, deduplicated warnings,
//! and the same result on a second parse.
//!
//! Whether the parser dropped a path, a stroke or a gradient it should have
//! dropped is not asserted by this harness: `parse_svg` returns only the
//! paths it kept, so the harness could tell only by repeating the parser's
//! transform and range checks. The corpus replay instead checks one seed
//! per dropped-geometry warning (`OUT_OF_RANGE`, `NON_FINITE`,
//! `STROKE_DROPPED`, `GRADIENT_DROPPED`).

use super::tree::assert_tree;
use crate::error::ImageError;
use crate::svg::{GRADIENT_DROPPED, NON_FINITE, OUT_OF_RANGE, STROKE_DROPPED};
use crate::{SvgLimits, SvgPaint, SvgTree, parse_svg};

#[cfg(test)]
mod tests;

/// Why [`parse_svg`] refused a document, read from its error message.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SvgRefusal {
    /// The root element is not `<svg>`.
    Root,
    /// The viewBox (or `width`/`height`) is outside the accepted limits.
    ViewBox,
    /// More elements than `SvgLimits::max_nodes`.
    Nodes,
    /// Groups nested deeper than `SvgLimits::max_depth`.
    Depth,
    /// Any other refusal (malformed XML, a missing or unparsable size).
    Other,
}

/// Which branches one input ran, for the replay test's positive controls.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct SvgPaths {
    /// The tree holds at least one path.
    pub drew: bool,
    /// A path is filled with a linear or radial gradient.
    pub gradient: bool,
    /// The tree carries at least one warning.
    pub warned: bool,
    /// A path was not drawn because a coordinate is more than `RANGE_RATIO`
    /// viewBox widths (x) or heights (y) from the viewBox origin.
    pub out_of_range: bool,
    /// A path was not drawn because a coordinate is not finite.
    pub non_finite: bool,
    /// A stroke was not drawn because it is wider than the stroke limit.
    pub stroke_dropped: bool,
    /// A gradient was not used because a number's absolute value exceeds
    /// twice the larger coordinate range.
    pub gradient_dropped: bool,
    /// The document was refused, and why.
    pub refused: Option<SvgRefusal>,
}

/// Parses one fuzz input as SVG markup and asserts the limits of the tree.
///
/// # Panics
///
/// Panics when an accepted tree breaks a limit (see [`assert_tree`]) or
/// when two parses of the same markup differ.
pub fn svg(input: &str) -> SvgPaths {
    let limits = SvgLimits::default();
    let first = parse_svg(input, &limits);
    assert_eq!(
        format!("{first:?}"),
        format!("{:?}", parse_svg(input, &limits)),
        "parsing the same markup twice gave different results"
    );
    match first {
        Ok(tree) => {
            assert_tree(&tree, input.len());
            paths_of(&tree)
        }
        Err(err) => SvgPaths {
            refused: Some(refusal_of(&err)),
            ..SvgPaths::default()
        },
    }
}

/// The branches an accepted tree shows.
fn paths_of(tree: &SvgTree) -> SvgPaths {
    let warned_with = |message: &str| tree.warnings.iter().any(|w| w == message);
    SvgPaths {
        drew: !tree.paths.is_empty(),
        gradient: tree
            .paths
            .iter()
            .any(|p| matches!(p.fill, Some(SvgPaint::Linear(_) | SvgPaint::Radial(_)))),
        warned: !tree.warnings.is_empty(),
        out_of_range: warned_with(OUT_OF_RANGE),
        non_finite: warned_with(NON_FINITE),
        stroke_dropped: warned_with(STROKE_DROPPED),
        gradient_dropped: warned_with(GRADIENT_DROPPED),
        refused: None,
    }
}

/// Reads the refusal reason from a [`parse_svg`] error's message.
fn refusal_of(err: &ImageError) -> SvgRefusal {
    let message = err.to_string();
    if message.contains("root element is") {
        SvgRefusal::Root
    } else if message.contains("outside the supported range") {
        SvgRefusal::ViewBox
    } else if message.contains("more than") {
        SvgRefusal::Nodes
    } else if message.contains("nesting exceeds") {
        SvgRefusal::Depth
    } else {
        SvgRefusal::Other
    }
}
