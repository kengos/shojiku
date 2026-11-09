//! Unit tests for the image fit math and its length cap.

use super::*;

#[test]
fn each_fit_sizes_the_asset_against_the_content_box() {
    let mut diags = Diagnostics::new();
    let mut fit = |f| fitted_size(f, (20.0, 10.0), 100.0, 100.0, &mut diags);
    assert_eq!(fit(ImageFit::Contain), (100.0, 50.0));
    assert_eq!(fit(ImageFit::Cover), (200.0, 100.0));
    assert_eq!(fit(ImageFit::Stretch), (100.0, 100.0));
    assert_eq!(fit(ImageFit::None), (20.0, 10.0));
    // A drawn size exactly at the cap is kept.
    assert_eq!(
        fitted_size(
            ImageFit::None,
            (MAX_RESOLVED_PT, 1.0),
            10.0,
            10.0,
            &mut diags
        ),
        (MAX_RESOLVED_PT, 1.0)
    );
    assert!(diags.is_empty());
}

#[test]
fn a_drawn_size_over_the_cap_falls_back_to_contain_with_a_warning() {
    // `none` at an intrinsic size past the cap, and `cover` of a 1e5:1
    // asset in a 100 pt box (the drawn width is 1e7 pt).
    for (fit, intrinsic) in [(ImageFit::None, (2e6, 1.0)), (ImageFit::Cover, (1e5, 1.0))] {
        let mut diags = Diagnostics::new();
        let size = fitted_size(fit, intrinsic, 100.0, 100.0, &mut diags);
        assert_eq!(size, fit_size(ImageFit::Contain, intrinsic, 100.0, 100.0));
        assert!(
            diags.iter().any(|d| d.code == "length_out_of_range"),
            "{fit:?}: {diags:?}"
        );
    }
}
