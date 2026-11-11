//! How many candidate prefixes the clamp shapes by themselves, and what it
//! keeps on a line where `MAX_SHAPINGS` prefixes are shaped.

use super::*;
use crate::font::test_support::ja_store;
use crate::fuzz::test_chain;

/// Clamps `line` into one line through `clamp_with_shaper`, with
/// `run_width` as the prefix shaping, and returns the
/// result and the number of prefixes shaped by themselves.
fn clamp_counting(chain: &[&FontFace], line: &str, width: f64) -> (Clamped, usize) {
    let mut shaped = 0;
    let clamped = clamp_with_shaper(
        chain,
        vec![line.to_string()],
        (10.0, 0.0),
        width,
        1,
        |prefix| {
            shaped += 1;
            run_width(chain, prefix, 10.0, RunOptions::spacing_only(0.0))
        },
    );
    (clamped, shaped)
}

#[test]
fn a_long_japanese_line_needs_no_shaping_of_its_own() {
    let store = ja_store();
    let face = store.face(None);
    let (clamped, shaped) = clamp_counting(&[face], &"あ".repeat(30_000), 200.0);
    assert_eq!(shaped, 0);
    assert!(!clamped.bound_reached);
    assert!(clamped.lines[0].chars().count() > 10);
}

#[test]
fn a_line_ending_in_many_prohibited_chars_shapes_at_most_one_prefix() {
    let store = ja_store();
    let face = store.face(None);
    let line = format!("あ{}", "「".repeat(10_000));
    let (clamped, shaped) = clamp_counting(&[face], &line, 200.0);
    assert!(shaped <= 1, "shaped {shaped} prefixes");
    assert_eq!(clamped.lines, vec!["あ…".to_string()]);
}

#[test]
fn a_line_with_no_safe_cut_shapes_max_shapings_prefixes_and_keeps_only_the_ellipsis() {
    let chain: Vec<&FontFace> = test_chain().iter().collect();
    // Noto Sans kerns "AV" and "VA", so no cut inside the line has a known
    // width: the clamp shapes `MAX_SHAPINGS` prefixes from the end of the
    // line, then skips the rest, and no cut with a known width fits. The
    // kept text is empty.
    let line = "AV".repeat(200);
    let (clamped, shaped) = clamp_counting(&chain, &line, 30.0);
    assert_eq!(shaped, MAX_SHAPINGS);
    assert!(clamped.bound_reached);
    assert_eq!(clamped.lines, vec!["…".to_string()]);
}

#[test]
fn a_line_with_unsafe_cuts_below_the_shaping_bound_keeps_a_fitting_prefix() {
    let chain: Vec<&FontFace> = test_chain().iter().collect();
    // Kerned pairs, combining marks and spaces: the kept text is a prefix
    // of the line that ends in no whitespace and fits with `…`.
    let line = "AVAVTo\u{301}fi ".repeat(3);
    for width in [30.0, 120.0, 600.0] {
        let (clamped, shaped) = clamp_counting(&chain, &line, width);
        assert!(shaped <= MAX_SHAPINGS, "shaped {shaped} prefixes");
        assert!(!clamped.bound_reached, "width {width}");
        let prefix = clamped.lines[0].strip_suffix('…').unwrap();
        assert!(line.starts_with(prefix));
        assert_eq!(prefix, prefix.trim_end());
        let opts = RunOptions::spacing_only(0.0);
        let measured = run_width(&chain, prefix, 10.0, opts) + run_width(&chain, "…", 10.0, opts);
        assert!(
            prefix.is_empty() || !exceeds(measured, width),
            "width {width}"
        );
    }
}
