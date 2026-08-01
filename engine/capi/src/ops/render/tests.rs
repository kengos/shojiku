//! The PDF backend's refusal, mapped.
//!
//! Tested directly rather than through a document, because the backend only
//! refuses a page-less layout and the layout engine does not produce one —
//! there is no template that would reach this from the outside.

use super::*;

#[test]
fn a_backend_refusal_becomes_a_host_cause_on_the_render_step() {
    let failure = Failure::from(RenderError::NoPages);
    // An outcome, not caller misuse: the status stays OK and the verdict
    // rides on the result.
    assert_eq!(failure.status(), crate::status::SHOJIKU_OK);
    let error = failure.into_result().error_for_test().to_string();
    assert!(error.contains("\"step\":\"render\""));
    assert!(error.contains("\"kind\":\"pdf\""));
    assert!(error.contains("no pages"));
}
