//! The rasterizer's refusal, mapped. Same reasoning as the render side.

use super::*;

#[test]
fn a_rasterizer_refusal_becomes_a_host_cause_on_the_preview_step() {
    let failure = Failure::from(RenderPngError::BadScale(0.0));
    assert_eq!(failure.status(), crate::status::SHOJIKU_OK);
    let error = failure.into_result().error_for_test().to_string();
    assert!(error.contains("\"step\":\"preview\""));
    assert!(error.contains("\"kind\":\"raster\""));
}
