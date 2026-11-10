//! Unit tests for the SVG harness: the branch each kind of markup runs,
//! including each geometry the parser drops with a warning and each
//! refusal.

use super::*;

#[test]
fn a_filled_and_a_gradient_path_are_drawn() {
    let paths = svg(r##"<svg viewBox="0 0 10 10">
        <defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs>
        <rect width="10" height="10" fill="url(#g)"/>
        <circle cx="5" cy="5" r="2" fill="none" stroke="#000"/>
    </svg>"##);
    assert_eq!(
        paths,
        SvgPaths {
            drew: true,
            gradient: true,
            ..SvgPaths::default()
        }
    );
}

#[test]
fn an_unsupported_feature_warns() {
    let paths = svg(
        r##"<svg viewBox="0 0 4 4"><rect width="4" height="4" rx="1"/><use href="#a"/></svg>"##,
    );
    assert!(
        paths.drew && paths.warned && !paths.out_of_range,
        "{paths:?}"
    );
}

#[test]
fn each_dropped_geometry_is_reported_by_its_warning() {
    let far = svg(r#"<svg viewBox="0 0 1 1"><path d="M0 0L2000 0L0 1z"/></svg>"#);
    assert!(far.out_of_range && !far.drew, "{far:?}");

    let infinite = svg(
        r#"<svg viewBox="0 0 1 1"><g transform="scale(1e300)"><rect width="1e10" height="1"/></g></svg>"#,
    );
    assert!(infinite.non_finite && !infinite.drew, "{infinite:?}");

    let wide = svg(
        r##"<svg viewBox="0 0 1 1"><rect width="1" height="1" stroke="#000" stroke-width="2000"/></svg>"##,
    );
    assert!(wide.stroke_dropped && wide.drew, "{wide:?}");

    let gradient = svg(r##"<svg viewBox="0 0 1 1">
        <linearGradient id="g" gradientUnits="userSpaceOnUse" x2="1e9"><stop offset="0" stop-color="#f00"/></linearGradient>
        <rect width="1" height="1" fill="url(#g)" stroke="#000"/>
    </svg>"##);
    assert!(
        gradient.gradient_dropped && gradient.drew && !gradient.gradient,
        "{gradient:?}"
    );
}

#[test]
fn each_refusal_is_read_from_its_message() {
    let refused = |markup: &str| svg(markup).refused;
    assert_eq!(refused("<g/>"), Some(SvgRefusal::Root));
    assert_eq!(
        refused(r#"<svg viewBox="0 0 2000000 1"/>"#),
        Some(SvgRefusal::ViewBox)
    );
    let many = format!(r#"<svg viewBox="0 0 1 1">{}</svg>"#, "<g/>".repeat(10_001));
    assert_eq!(refused(&many), Some(SvgRefusal::Nodes));
    let deep = format!(
        r#"<svg viewBox="0 0 1 1">{}{}</svg>"#,
        "<g>".repeat(40),
        "</g>".repeat(40)
    );
    assert_eq!(refused(&deep), Some(SvgRefusal::Depth));
    assert_eq!(refused("not markup"), Some(SvgRefusal::Other));
}

#[test]
fn a_run_of_z_and_a_run_of_large_arcs_give_between_half_and_one_command_per_byte() {
    // A run of `z` is one `Close` per byte, and an arc with a radius of at
    // least 100,000 units is 11 cubics from 18 bytes: these inputs give
    // more than half a command per byte, so the bound of one command per
    // byte is within a factor of two of them.
    let closes = format!(
        r#"<svg viewBox="0 0 1 1"><path d="M0 0{}"/></svg>"#,
        "z".repeat(2000)
    );
    let arcs = format!(
        r#"<svg viewBox="0 0 1000 1000"><path d="M0 0{}"/></svg>"#,
        "a1e5 1e5 0 1 1 1 0".repeat(200)
    );
    for markup in [closes, arcs] {
        let tree = parse_svg(&markup, &SvgLimits::default()).expect("the markup parses");
        let commands: usize = tree.paths.iter().map(|p| p.cmds.len()).sum();
        assert!(
            commands * 2 > markup.len() && commands <= markup.len(),
            "{commands} commands from {} bytes",
            markup.len()
        );
        assert_eq!(svg(&markup).refused, None);
    }
}
