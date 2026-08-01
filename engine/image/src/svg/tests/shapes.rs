//! Shapes, transforms, and inheritance.

use super::*;

#[test]
fn invalid_paints_and_empty_paths_are_handled() {
    let tree = parse(
        r##"<svg viewBox="0 0 10 10">
              <rect width="1" height="1" fill="bogus" stroke="alsobogus"/>
              <rect x="1" width="1" height="1" fill="#00ff00" stroke="none"/>
              <path d="" fill="#000000"/>
            </svg>"##,
    );
    // An invalid fill keeps the inherited black; an invalid stroke keeps the
    // inherited (none). Both warn.
    assert_eq!(solid_fill(&tree.paths[0]), Some((0.0, 0.0, 0.0)));
    assert_eq!(tree.paths[0].stroke, None);
    // `stroke="none"` clears the stroke on the green rect.
    assert_eq!(solid_fill(&tree.paths[1]), Some((0.0, 1.0, 0.0)));
    assert_eq!(tree.paths[1].stroke, None);
    // The empty path emits nothing; only the two rects remain.
    assert_eq!(tree.paths.len(), 2);
    assert_eq!(
        tree.warnings
            .iter()
            .filter(|w| w.contains("unsupported paint"))
            .count(),
        2
    );
}

#[test]
fn parses_rect_with_viewbox_offset() {
    let tree = parse(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 100 50">
                  <rect x="10" y="20" width="30" height="40" fill="#ff0000"/>
                </svg>"##,
    );
    assert_eq!((tree.width, tree.height), (100.0, 50.0));
    assert_eq!(tree.paths.len(), 1);
    let path = &tree.paths[0];
    // viewBox min-x/min-y are baked into the coordinates.
    assert_eq!(path.cmds[0], PathCmd::MoveTo(0.0, 0.0));
    assert_eq!(path.cmds[2], PathCmd::LineTo(30.0, 40.0));
    assert_eq!(solid_fill(path), Some((1.0, 0.0, 0.0)));
    assert_eq!(path.stroke, None);
    assert!(tree.warnings.is_empty(), "warnings: {:?}", tree.warnings);
}

#[test]
fn falls_back_to_width_height() {
    let tree = parse(r#"<svg width="64px" height="32"><rect width="1" height="1"/></svg>"#);
    assert_eq!((tree.width, tree.height), (64.0, 32.0));
    // Default fill is black.
    assert_eq!(solid_fill(&tree.paths[0]), Some((0.0, 0.0, 0.0)));
}

#[test]
fn group_transform_and_inheritance_apply() {
    let tree = parse(
        r##"<svg viewBox="0 0 100 100">
                  <g transform="translate(10 20) scale(2)" fill="#00ff00">
                    <rect width="5" height="5"/>
                  </g>
                </svg>"##,
    );
    let path = &tree.paths[0];
    assert_eq!(path.cmds[0], PathCmd::MoveTo(10.0, 20.0));
    assert_eq!(path.cmds[2], PathCmd::LineTo(20.0, 30.0));
    assert_eq!(solid_fill(path), Some((0.0, 1.0, 0.0)));
}

#[test]
fn rotate_and_matrix_and_skew_transforms_compose() {
    let tree = parse(
        r#"<svg viewBox="0 0 10 10">
                 <g transform="rotate(90)"><rect width="1" height="1"/></g>
                 <g transform="matrix(1 0 0 1 3 4)"><rect width="1" height="1"/></g>
                 <g transform="skewX(45) skewY(0)"><rect width="1" height="1"/></g>
               </svg>"#,
    );
    // rotate(90): (1, 0) -> (0, 1).
    let PathCmd::LineTo(x, y) = tree.paths[0].cmds[1] else { panic!("line") };
    assert!((x - 0.0).abs() < 1e-9 && (y - 1.0).abs() < 1e-9);
    assert_eq!(tree.paths[1].cmds[0], PathCmd::MoveTo(3.0, 4.0));
    // skewX(45): (0, 1) -> (1, 1) on the rect's bottom-left corner.
    let PathCmd::LineTo(x, y) = tree.paths[2].cmds[3] else { panic!("line") };
    assert!((x - 1.0).abs() < 1e-9 && (y - 1.0).abs() < 1e-9);
}

#[test]
fn invalid_transform_warns_and_is_truncated() {
    let tree = parse(
        r#"<svg viewBox="0 0 10 10">
                 <g transform="translate(1 1) bogus(2)"><rect width="1" height="1"/></g>
               </svg>"#,
    );
    assert_eq!(tree.paths[0].cmds[0], PathCmd::MoveTo(1.0, 1.0));
    assert!(tree
        .warnings
        .iter()
        .any(|w| w.contains("invalid transform")));
}

#[test]
fn circle_ellipse_line_polyline_polygon() {
    let tree = parse(
        r##"<svg viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="10"/>
                  <ellipse cx="10" cy="10" rx="4" ry="2"/>
                  <line x1="0" y1="0" x2="10" y2="10" stroke="#0000ff" stroke-width="2.5"/>
                  <polyline points="0,0 5,5 10,0" fill="none" stroke="#000000"/>
                  <polygon points="0,0 4,0 4,4"/>
                </svg>"##,
    );
    assert_eq!(tree.paths.len(), 5);
    // Circle starts at (cx + r, cy) and is made of four cubics.
    assert_eq!(tree.paths[0].cmds[0], PathCmd::MoveTo(60.0, 50.0));
    assert_eq!(
        tree.paths[0]
            .cmds
            .iter()
            .filter(|c| matches!(c, PathCmd::CurveTo(..)))
            .count(),
        4
    );
    // Lines are stroke-only, with the parsed stroke width.
    assert_eq!(tree.paths[2].fill, None);
    assert_eq!(solid_fill(&tree.paths[2]), None);
    assert_eq!(tree.paths[2].stroke, Some((0.0, 0.0, 1.0)));
    assert_eq!(tree.paths[2].stroke_width, 2.5);
    // Polygon closes, polyline does not.
    assert!(!tree.paths[3].cmds.contains(&PathCmd::Close));
    assert!(tree.paths[3].stroke.is_some());
    assert!(tree.paths[4].cmds.contains(&PathCmd::Close));
}

#[test]
fn degenerate_shapes_are_skipped() {
    let tree = parse(
        r##"<svg viewBox="0 0 10 10">
                  <rect width="0" height="5"/>
                  <circle cx="1" cy="1" r="0"/>
                  <ellipse cx="1" cy="1" rx="1" ry="0"/>
                  <polyline points="" stroke="#000000"/>
                  <rect width="2" height="2" fill="none"/>
                </svg>"##,
    );
    // Nothing visible: zero sizes, empty points, fill+stroke none.
    assert!(tree.paths.is_empty(), "paths: {}", tree.paths.len());
}
