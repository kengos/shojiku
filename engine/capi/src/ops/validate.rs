//! `shojiku_validate`: the document's diagnostics, without laying it out.
//!
//! The lenient path on purpose — a parse failure comes back as a diagnostic
//! rather than a failure, because this is what an editor calls on every
//! keystroke and a broken key has to render inline. `params` is optional
//! here; only laying out needs it.

use crate::request::Request;
use crate::result::ShojikuResult;
use crate::status::{encode, Failure};
use shojiku_authoring::validate_strings;

/// Validates the sources. Errors make the result unsuccessful; the
/// diagnostics ride along either way.
pub(crate) fn run(request: &Request) -> Result<ShojikuResult, Failure> {
    let diagnostics = validate_strings(
        request.definitions.as_deref(),
        &request.template,
        request.params.as_deref(),
    );
    let json = encode(&diagnostics);
    if diagnostics.has_errors() {
        return Ok(Failure::Document {
            step: "validate",
            diagnostics: json,
        }
        .into_result());
    }
    Ok(ShojikuResult::diagnostics(json))
}
