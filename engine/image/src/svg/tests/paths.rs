//! Path data, size/document rejection, caps, and warnings.

use super::*;

#[test]
fn path_data_kitchen_sink() {
    let tree = parse(
        r#"<svg viewBox="0 0 100 100">
                 <path d="M 10 10 L 20 10 l 0 10 H 10 V 10
                          C 10 5 20 5 20 10 S 30 15 30 10
                          Q 35 0 40 10 T 50 10
                          A 5 5 0 0 1 60 10 Z"/>
               </svg>"#,
    );
    let cmds = &tree.paths[0].cmds;
    assert_eq!(cmds[0], PathCmd::MoveTo(10.0, 10.0));
    assert_eq!(cmds[1], PathCmd::LineTo(20.0, 10.0));
    assert_eq!(cmds[2], PathCmd::LineTo(20.0, 20.0)); // relative l
    assert_eq!(cmds[3], PathCmd::LineTo(10.0, 20.0)); // H
    assert_eq!(cmds[4], PathCmd::LineTo(10.0, 10.0)); // V
    assert!(matches!(cmds[5], PathCmd::CurveTo(..))); // C
                                                      // S reflects the previous cubic control point (20,5) -> (20,15).
    let PathCmd::CurveTo(x1, y1, ..) = cmds[6] else { panic!("S") };
    assert_eq!((x1, y1), (20.0, 15.0));
    assert!(matches!(cmds[7], PathCmd::CurveTo(..))); // Q as cubic
    assert!(matches!(cmds[8], PathCmd::CurveTo(..))); // T as cubic
    assert!(matches!(cmds.last(), Some(PathCmd::Close)));
    // The arc produced at least one cubic between T and Z.
    assert!(cmds.len() >= 10);
    assert!(tree.warnings.is_empty(), "warnings: {:?}", tree.warnings);
}

#[test]
fn smooth_without_predecessor_uses_current_point() {
    let tree = parse(
        r#"<svg viewBox="0 0 10 10">
                 <path d="M 1 1 S 3 3 5 1"/>
                 <path d="M 1 1 T 5 1"/>
               </svg>"#,
    );
    // S with no previous cubic: first control point == current point.
    let PathCmd::CurveTo(x1, y1, ..) = tree.paths[0].cmds[1] else { panic!("S") };
    assert_eq!((x1, y1), (1.0, 1.0));
    // T with no previous quadratic degenerates toward a line.
    let PathCmd::CurveTo(.., x, y) = tree.paths[1].cmds[1] else { panic!("T") };
    assert_eq!((x, y), (5.0, 1.0));
}

#[test]
fn zero_radius_arc_becomes_a_line() {
    let tree = parse(r#"<svg viewBox="0 0 10 10"><path d="M 0 0 A 0 0 0 0 0 5 5"/></svg>"#);
    assert_eq!(tree.paths[0].cmds[1], PathCmd::LineTo(5.0, 5.0));
}

#[test]
fn invalid_path_data_truncates_with_warning() {
    let tree = parse(r#"<svg viewBox="0 0 10 10"><path d="M 1 1 L 2 2 X 9"/></svg>"#);
    assert_eq!(tree.paths[0].cmds.len(), 2);
    assert!(tree
        .warnings
        .iter()
        .any(|w| w.contains("invalid path data")));
}

#[test]
fn non_finite_coordinates_truncate_with_warning() {
    // svgtypes rejects literal `inf`, but relative segments can still
    // overflow to infinity by accumulation.
    let tree = parse(r#"<svg viewBox="0 0 10 10"><path d="M 1e308 1 l 1e308 0 L 3 3"/></svg>"#);
    assert!(tree.warnings.iter().any(|w| w.contains("non-finite")));
    assert_eq!(tree.paths[0].cmds.len(), 2);
}

#[test]
fn unsupported_features_warn_once() {
    let tree = parse(
        r##"<svg viewBox="0 0 10 10">
                  <text x="0" y="0">hi</text>
                  <text x="1" y="1">again</text>
                  <rect width="1" height="1" rx="0.2"
                        fill="url(#grad)" opacity="0.5"/>
                  <rect width="1" height="1" stroke-width="bogus" stroke="#00000080"/>
                  <rect width="1" height="1" stroke-width="2em" stroke="#000000"/>
                </svg>"##,
    );
    let text_warnings = tree
        .warnings
        .iter()
        .filter(|w| w.contains("<text>"))
        .count();
    assert_eq!(text_warnings, 1, "warnings: {:?}", tree.warnings);
    // An undefined gradient reference warns (author-facing), like a typo'd id.
    assert!(tree
        .warnings
        .iter()
        .any(|w| w.contains("unknown gradient") && w.contains("grad")));
    assert!(tree.warnings.iter().any(|w| w.contains("opacity")));
    assert!(tree.warnings.iter().any(|w| w.contains("square")));
    assert!(tree.warnings.iter().any(|w| w.contains("stroke-width")));
    assert!(tree.warnings.iter().any(|w| w.contains("transparency")));
}

#[test]
fn invalid_shape_numbers_fall_back_to_defaults() {
    let tree = parse(r#"<svg viewBox="0 0 10 10"><rect x="oops" width="2" height="2"/></svg>"#);
    assert_eq!(tree.paths[0].cmds[0], PathCmd::MoveTo(0.0, 0.0));
    assert!(tree.warnings.iter().any(|w| w.contains("`x`")));
}

#[test]
fn rejects_documents_without_a_size() {
    let err = parse_svg("<svg><rect/></svg>", &SvgLimits::default()).expect_err("no size");
    assert!(err.to_string().contains("viewBox"), "got: {err}");
    let err = parse_svg(r#"<svg width="10"><rect/></svg>"#, &SvgLimits::default())
        .expect_err("height missing");
    assert!(err.to_string().contains("viewBox"), "got: {err}");
}

#[test]
fn rejects_bad_sizes() {
    for doc in [
        r#"<svg viewBox="0 0 -5 10"/>"#,
        r#"<svg viewBox="0 0 1e999 10"/>"#,
        r#"<svg width="10em" height="4"/>"#,
        r#"<svg width="-3" height="4"/>"#,
        r#"<svg width="x" height="4"/>"#,
    ] {
        let result = parse_svg(doc, &SvgLimits::default());
        assert!(matches!(result, Err(ImageError::Svg(_))), "accepted: {doc}");
    }
}

#[test]
fn rejects_non_svg_documents() {
    assert!(matches!(
        parse_svg("not xml <", &SvgLimits::default()),
        Err(ImageError::Svg(msg)) if msg.contains("xml")
    ));
    assert!(matches!(
        parse_svg("<html/>", &SvgLimits::default()),
        Err(ImageError::Svg(msg)) if msg.contains("<html>")
    ));
}

#[test]
fn enforces_node_and_depth_caps() {
    let many: String = (0..20).map(|_| r#"<rect width="1" height="1"/>"#).collect();
    let doc = format!(r#"<svg viewBox="0 0 1 1">{many}</svg>"#);
    let limits = SvgLimits {
        max_nodes: 10,
        max_depth: 32,
    };
    assert!(matches!(
        parse_svg(&doc, &limits),
        Err(ImageError::Svg(msg)) if msg.contains("elements")
    ));

    let deep = format!(
        "{}{}{}",
        r#"<svg viewBox="0 0 1 1">"#,
        "<g>".repeat(5) + r#"<rect width="1" height="1"/>"# + &"</g>".repeat(5),
        "</svg>"
    );
    let limits = SvgLimits {
        max_nodes: 100,
        max_depth: 3,
    };
    assert!(matches!(
        parse_svg(&deep, &limits),
        Err(ImageError::Svg(msg)) if msg.contains("nesting")
    ));
}

#[test]
fn path_without_d_is_ignored() {
    let tree = parse(r#"<svg viewBox="0 0 10 10"><path/></svg>"#);
    assert!(tree.paths.is_empty());
    assert!(tree.warnings.is_empty());
}
