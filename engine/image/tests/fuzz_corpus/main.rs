//! The image fuzz corpora (`image_raster`, `image_svg`, `image_source`),
//! replayed through the same harnesses the fuzz targets call.
//!
//! Nothing in CI builds `engine/fuzz`, so this replay runs every committed
//! seed through the harness assertions, and a change that makes any seed
//! fail a harness assertion fails CI between on-demand fuzz runs. Each
//! harness returns the branches a seed ran, and the replay asserts that
//! some seed ran each one. The SVG replay also checks, seed by seed, that each
//! geometry the parser drops is both reported and absent from the tree.

use shojiku_image::fuzz::{SvgRefusal, raster, source, svg};
use shojiku_image::{SvgLimits, SvgPaint, parse_svg};
use std::path::PathBuf;

/// Every seed committed for one fuzz target, by file name, as bytes.
fn corpus(target: &str) -> Vec<(String, Vec<u8>)> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../fuzz/corpus")
        .join(target);
    let mut seeds = Vec::new();
    for entry in std::fs::read_dir(&dir).expect("the corpus directory") {
        let path = entry.expect("a corpus entry").path();
        let name = path
            .file_name()
            .expect("a file name")
            .to_string_lossy()
            .into_owned();
        seeds.push((name, std::fs::read(&path).expect("a corpus file")));
    }
    // An empty directory would make every loop run zero times and still pass.
    assert!(!seeds.is_empty(), "{target}: the corpus holds no seeds");
    seeds.sort();
    seeds
}

/// The UTF-8 seeds of one fuzz target, by file name; seeds that are not
/// UTF-8 are skipped, as the `image_svg` and `image_source` fuzz targets
/// skip them.
fn text_corpus(target: &str) -> Vec<(String, String)> {
    corpus(target)
        .into_iter()
        .filter_map(|(name, bytes)| String::from_utf8(bytes).ok().map(|text| (name, text)))
        .collect()
}

/// The UTF-8 seed `name` of one fuzz target.
fn seed(target: &str, name: &str) -> String {
    text_corpus(target)
        .into_iter()
        .find(|(n, _)| n == name)
        .unwrap_or_else(|| panic!("{target}: the seed {name} is missing"))
        .1
}

#[test]
fn every_raster_seed_keeps_the_raster_properties() {
    let seeds = corpus("image_raster");
    assert!(seeds.len() >= 15, "the committed raster seeds are missing");
    let paths: Vec<_> = seeds.iter().map(|(_, bytes)| raster(bytes)).collect();
    // The lossy WebP whose height field carries a scaling code is accepted
    // and decodes at the size the header check reads. When the header check
    // reads the scaling bits as size, the replay fails either on the
    // harness's size assertion or, if a pixel cap refuses the image first,
    // on this assertion.
    let scaled = seeds
        .iter()
        .position(|(name, _)| name == "webp-lossy-scaled-height.bin")
        .expect("the scaled-height WebP seed is committed");
    assert!(
        paths[scaled].webp,
        "the scaled-height WebP was not accepted and decoded"
    );
    // Positive controls: each format accepted and decoded, a pixel-cap
    // refusal, a header that reads but data that does not decode, a GIF
    // refused for its first frame, and markup that `parse_svg` accepts.
    assert!(paths.iter().any(|p| p.png), "no raster seed decodes as PNG");
    assert!(
        paths.iter().any(|p| p.jpeg),
        "no raster seed decodes as JPEG"
    );
    assert!(paths.iter().any(|p| p.gif), "no raster seed decodes as GIF");
    assert!(
        paths.iter().any(|p| p.webp),
        "no raster seed decodes as WebP"
    );
    assert!(
        paths.iter().any(|p| p.pixel_refused),
        "no raster seed exceeds the pixel cap"
    );
    assert!(
        paths.iter().any(|p| p.decode_failed),
        "no raster seed is accepted from its header and fails to decode"
    );
    assert!(
        paths.iter().any(|p| p.gif_frame_refused),
        "no raster seed is a GIF refused for its first frame"
    );
    assert!(
        paths.iter().any(|p| p.svg),
        "no raster seed is markup that parse_svg accepts"
    );
}

#[test]
fn every_svg_seed_keeps_the_tree_limits() {
    let seeds = text_corpus("image_svg");
    assert!(seeds.len() >= 16, "the committed SVG seeds are missing");
    let paths: Vec<_> = seeds.iter().map(|(_, text)| svg(text)).collect();
    // Positive controls: a drawn path, a gradient fill, a warning, each
    // geometry the parser drops, and each refusal.
    assert!(paths.iter().any(|p| p.drew), "no SVG seed draws a path");
    assert!(
        paths.iter().any(|p| p.gradient),
        "no SVG seed fills with a gradient"
    );
    assert!(paths.iter().any(|p| p.warned), "no SVG seed warns");
    for refusal in [
        SvgRefusal::Root,
        SvgRefusal::ViewBox,
        SvgRefusal::Nodes,
        SvgRefusal::Depth,
        SvgRefusal::Other,
    ] {
        assert!(
            paths.iter().any(|p| p.refused == Some(refusal)),
            "no SVG seed is refused as {refusal:?}"
        );
    }
}

#[test]
fn each_dropped_geometry_seed_is_reported_and_left_out_of_the_tree() {
    let tree = |name: &str| {
        parse_svg(&seed("image_svg", name), &SvgLimits::default()).expect("the seed parses")
    };
    let warns = |name: &str, needle: &str| tree(name).warnings.iter().any(|w| w.contains(needle));
    // A path outside the coordinate range: warned, and only the square
    // inside it is drawn.
    assert!(warns(
        "path-outside-the-range.svg",
        "more than 1000 viewBox widths"
    ));
    assert_eq!(tree("path-outside-the-range.svg").paths.len(), 1);
    assert!(svg(&seed("image_svg", "path-outside-the-range.svg")).out_of_range);
    // A non-finite path: warned, and only the finite square is drawn.
    assert!(warns("path-non-finite.svg", "non-finite coordinate"));
    assert_eq!(tree("path-non-finite.svg").paths.len(), 1);
    assert!(svg(&seed("image_svg", "path-non-finite.svg")).non_finite);
    // A stroke wider than the stroke limit: warned, the stroke dropped, the
    // fill kept.
    let wide = tree("stroke-over-the-limit.svg");
    assert!(warns("stroke-over-the-limit.svg", "stroke wider than"));
    assert!(
        wide.paths.len() == 1 && wide.paths[0].stroke.is_none() && wide.paths[0].fill.is_some()
    );
    assert!(svg(&seed("image_svg", "stroke-over-the-limit.svg")).stroke_dropped);
    // A gradient over the gradient limit: warned, no fill, the stroke kept.
    let gradient = tree("gradient-over-the-limit.svg");
    assert!(warns(
        "gradient-over-the-limit.svg",
        "gradient with a coordinate"
    ));
    assert!(
        gradient.paths.len() == 1
            && gradient.paths[0].fill.is_none()
            && gradient.paths[0].stroke.is_some()
    );
    assert!(svg(&seed("image_svg", "gradient-over-the-limit.svg")).gradient_dropped);
    // An arc whose squared radius overflows `f64` is refused; a full arc
    // with a radius of 400,000 units is drawn as exactly the per-arc cap of
    // 11 cubics, between its move and its close.
    let arcs = tree("arc-huge-radius.svg");
    assert!(warns("arc-huge-radius.svg", "non-finite coordinate"));
    assert_eq!(arcs.paths.len(), 1, "{:?}", arcs.warnings);
    assert_eq!(arcs.paths[0].cmds.len(), 1 + 11 + 1);
    assert!(matches!(arcs.paths[0].fill, Some(SvgPaint::Solid(_))));
}

#[test]
fn every_source_seed_keeps_the_source_rules() {
    let seeds = text_corpus("image_source");
    assert!(seeds.len() >= 19, "the committed source seeds are missing");
    let paths: Vec<_> = seeds.iter().map(|(_, text)| source(text)).collect();
    // Positive controls: each source form refused or loaded as the policy
    // decides.
    assert!(
        paths.iter().any(|p| p.remote),
        "no source seed is a refused remote URL"
    );
    assert!(
        paths.iter().any(|p| p.traversal),
        "no source seed is refused as traversal"
    );
    assert!(
        paths.iter().any(|p| p.bundled),
        "no source seed loads a bundled file"
    );
    assert!(
        paths.iter().any(|p| p.data_raster),
        "no source seed loads a data-URI raster"
    );
    assert!(
        paths.iter().any(|p| p.data_svg),
        "no source seed loads a data-URI SVG"
    );
    assert!(
        paths.iter().any(|p| p.inline_svg),
        "no source seed loads inline SVG"
    );
    assert!(
        paths.iter().any(|p| p.inline_refused_by_mode),
        "no source seed has inline content refused by bundled-only mode"
    );
    assert!(
        paths.iter().any(|p| p.denied_item),
        "no source seed is for an item on the deny list"
    );
    assert!(
        source(&seed("image_source", "inline-svg-bundled-mode-allowed.txt")).inline_svg,
        "bundled-only mode refused inline SVG for an item on the allow list"
    );
    assert!(
        paths.iter().any(|p| p.capped),
        "no source seed names an injected file over the byte or pixel cap"
    );
}
