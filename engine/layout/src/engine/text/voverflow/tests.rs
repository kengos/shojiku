//! Unit coverage for the pure vertical overflow policy math: the shrink
//! bisection's early-return and floor arms, the ellipsis end-column, and
//! the hung-column measurement — driven directly so every arm runs in
//! the crate's own test binary (the e2e suite reaches them through the
//! block builder only when a policy actually fires).

use super::*;
use crate::font::test_support::ja_store;
use shojiku_core::TextOrientation::Mixed;

fn ud(v: &VWrapArgs) -> VWrap<'_> {
    VWrap {
        chain: &v.chain,
        orient: Mixed,
        line_break: LineBreak::Normal,
        letter_spacing: 0.0,
        trim: TextSpacingTrim::SpaceAll,
        hanging: v.hanging,
        combine: None,
    }
}

struct VWrapArgs {
    chain: Vec<&'static FontFace>,
    hanging: HangingPunctuation,
}

fn args(hanging: HangingPunctuation) -> VWrapArgs {
    VWrapArgs {
        chain: vec![ja_store().get("biz-ud-gothic").unwrap()],
        hanging,
    }
}

#[test]
fn fit_returns_the_base_size_when_it_already_fits() {
    let a = args(HangingPunctuation::None);
    let v = ud(&a);
    // One 3-cell column (30pt) in a 100pt width at lh 1.0: fits at 10pt.
    let size = fit_columns_size(&v, "あいう", 10.0, 1.0, 100.0, 40.0);
    assert_eq!(size, 10.0);
}

#[test]
fn fit_bisects_down_and_floors_at_the_minimum() {
    let a = args(HangingPunctuation::None);
    let v = ud(&a);
    // 10 chars against a 25pt width: only a smaller size fits.
    let fitted = fit_columns_size(&v, "あいうえおかきくけこ", 10.0, 1.0, 25.0, 30.0);
    assert!((MIN_SHRINK_FONT_PT..10.0).contains(&fitted));
    // A width nothing fits keeps the floor.
    let floor = fit_columns_size(&v, &"あ".repeat(100), 10.0, 1.0, 1.0, 30.0);
    assert_eq!(floor, MIN_SHRINK_FONT_PT);
}

#[test]
fn ellipsize_appends_when_the_column_has_room() {
    let a = args(HangingPunctuation::None);
    let v = ud(&a);
    // 20pt of text in a 40pt basis: the `…` fits below, nothing trimmed.
    let out = ellipsize_column(v.chain, "あい", 10.0, Mixed, v.opts(), 40.0);
    assert_eq!(out, "あい…");
}

#[test]
fn ellipsize_trims_to_make_room_when_full() {
    let a = args(HangingPunctuation::None);
    let v = ud(&a);
    // 30pt of text filling a 30pt basis: one char is trimmed for the `…`.
    let out = ellipsize_column(v.chain, "あいう", 10.0, Mixed, v.opts(), 30.0);
    assert_eq!(out, "あい…");
}

#[test]
fn a_hung_column_measures_its_alignment_basis_without_the_hung_cell() {
    let a = args(HangingPunctuation::AllowEnd);
    let v = ud(&a);
    // 4-cell basis: the 、 hangs onto the first column past its bottom.
    let cols = measure_columns(&v, "ああああ、いい", 10.0, 40.0);
    assert_eq!(cols.len(), 2);
    assert!(cols[0].line.hung);
    assert!((cols[0].extent - 50.0).abs() < 0.5);
    assert!((cols[0].align_extent - 40.0).abs() < 0.5);
    // The plain second column aligns on its full extent.
    assert_eq!(cols[1].extent, cols[1].align_extent);
}
