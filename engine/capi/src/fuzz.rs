//! The fuzz harness of the C ABI, which the `capi_request` fuzz target of
//! the `host` group (`make engine:fuzz FUZZ_GROUP=host`) and the corpus
//! replay test both call.
//!
//! An SDK passes `shojiku_validate` the request envelope as a pointer and
//! a length, then reads the result handle through the `shojiku_result_*`
//! accessors and frees it. The harness makes exactly those calls with the
//! fuzz input as the envelope, and asserts: the status is never
//! `SHOJIKU_ERR_PANIC` (the C ABI's `catch_unwind` turns a panic into that
//! status; under the fuzzer, libfuzzer-sys's panic hook aborts first, so
//! this assertion is what reports a panic in the corpus replay test); a
//! handle is always returned; bytes that are not UTF-8
//! give `SHOJIKU_ERR_INVALID_UTF8`; an envelope the parser refuses gives
//! `SHOJIKU_ERR_INVALID_REQUEST`, including a `scale` outside
//! `0 < scale <= 10` and an asset id list over 256 entries; an accepted
//! envelope gives `SHOJIKU_OK`, and the result's success flag is 0 exactly
//! when its diagnostics hold an error; the diagnostics and error texts are
//! JSON (the diagnostics in the engine's own diagnostics shape), and an
//! error message holds no character the echo guard strips and at most
//! `MAX_MESSAGE` characters; and the same input gives the same result
//! twice.
//!
//! Doc-hidden `pub` rather than feature-gated, for the reason
//! `shojiku_verify`'s fuzz module gives: a feature-gated entry point is
//! compiled by `clippy --all-features` but invisible to the coverage gate.
//! Nothing here is API.

use crate::request::Request;
use crate::result::{
    ShojikuResult, shojiku_result_diagnostics_json, shojiku_result_error_json, shojiku_result_free,
    shojiku_result_success,
};
use crate::shojiku_validate;
use crate::status::{
    SHOJIKU_ERR_INVALID_REQUEST, SHOJIKU_ERR_INVALID_UTF8, SHOJIKU_ERR_PANIC, SHOJIKU_OK,
};
use serde_json::Value;
use shojiku_diagnostics::{Diagnostics, MAX_MESSAGE, sanitize};

#[cfg(test)]
mod tests;

/// Which assertions one input checked on a result a no-op engine would not
/// give, for the replay test's positive controls. Each flag is set after the
/// assertion it guards passed.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct RequestPaths {
    /// Bytes that are not UTF-8 gave `SHOJIKU_ERR_INVALID_UTF8`.
    pub invalid_utf8: bool,
    /// An envelope the parser refuses gave `SHOJIKU_ERR_INVALID_REQUEST`.
    pub invalid_request: bool,
    /// An envelope refused only for its `scale`: serde reads it and the
    /// asset id lists are within the cap, so a parser without the `scale`
    /// bound would accept it.
    pub scale_refused: bool,
    /// An envelope refused only for an asset id list over 256 entries:
    /// serde reads it and the `scale` is in range.
    pub too_many_ids: bool,
    /// A document that validates gave `SHOJIKU_OK` with success 1.
    pub valid: bool,
    /// A document with error diagnostics gave `SHOJIKU_OK` with success 0.
    pub refused: bool,
}

/// The most entries an asset id list of the envelope may hold.
const MAX_IDS: usize = 256;

/// The asset id lists of the envelope.
const ID_LISTS: [&str; 2] = ["allowDynamicImage", "denyDynamicImage"];

/// Whether `scale` is within the envelope's `0 < scale <= 10`.
fn scale_in_range(scale: f64) -> bool {
    scale > 0.0 && scale <= 10.0
}

/// What one call returned, read through the accessors.
#[derive(Debug, PartialEq)]
struct Outcome {
    status: i32,
    success: i32,
    diagnostics: String,
    error: String,
}

/// Validates one fuzz input through the C ABI and asserts the properties
/// in the module documentation.
///
/// # Panics
///
/// Panics when a property fails; the message names it.
pub fn request(data: &[u8]) -> RequestPaths {
    let outcome = call(data);
    assert_eq!(
        outcome,
        call(data),
        "the same request gave a different result"
    );
    assert_ne!(
        outcome.status, SHOJIKU_ERR_PANIC,
        "the call panicked: {}",
        outcome.error
    );
    let mut paths = RequestPaths::default();
    let Ok(text) = std::str::from_utf8(data) else {
        assert_failed(&outcome, SHOJIKU_ERR_INVALID_UTF8, "invalid_utf8");
        paths.invalid_utf8 = true;
        return paths;
    };
    if Request::parse(text).is_err() {
        assert_failed(&outcome, SHOJIKU_ERR_INVALID_REQUEST, "invalid_request");
        paths.invalid_request = true;
        record_bounds(text, &mut paths);
        return paths;
    }
    assert_accepted_bounds(text);
    assert_eq!(
        outcome.status, SHOJIKU_OK,
        "an accepted envelope did not give SHOJIKU_OK"
    );
    let diagnostics: Diagnostics = serde_json::from_str(&outcome.diagnostics)
        .expect("the diagnostics are not diagnostics JSON");
    assert_eq!(
        outcome.success == 0,
        diagnostics.has_errors(),
        "the success flag disagrees with the diagnostics"
    );
    if outcome.success == 0 {
        assert_eq!(
            error_field(&outcome, "kind"),
            "document",
            "a refused document has another kind"
        );
        paths.refused = true;
    } else {
        assert!(
            outcome.error.is_empty(),
            "a valid document carries an error"
        );
        paths.valid = true;
    }
    paths
}

/// Asserts that an envelope the parser accepted holds a `scale` within
/// `0 < scale <= 10` and asset id lists of at most 256 entries, read from
/// the JSON itself rather than through the parser.
fn assert_accepted_bounds(text: &str) {
    let envelope: Value = serde_json::from_str(text).expect("an accepted envelope is JSON");
    if let Some(scale) = envelope.get("scale").and_then(Value::as_f64) {
        assert!(scale_in_range(scale), "a scale of {scale} was accepted");
    }
    for key in ID_LISTS {
        let count = envelope
            .get(key)
            .and_then(Value::as_array)
            .map_or(0, Vec::len);
        assert!(
            count <= MAX_IDS,
            "`{key}` with {count} entries was accepted"
        );
    }
}

/// Records whether an envelope that serde reads was refused by exactly
/// one of the two bounds `Request::parse` adds: a parser without that
/// bound would accept the envelope, and [`assert_accepted_bounds`] would
/// fail on it.
fn record_bounds(text: &str, paths: &mut RequestPaths) {
    let Ok(request) = serde_json::from_str::<Request>(text) else {
        return;
    };
    match (
        request.check_asset_ids().is_ok(),
        request.check_scale().is_ok(),
    ) {
        (true, false) => paths.scale_refused = true,
        (false, true) => paths.too_many_ids = true,
        _ => {}
    }
}

/// Asserts a call-level failure: `status`, a zero success flag, no
/// diagnostics, and an error of `kind`.
fn assert_failed(outcome: &Outcome, status: i32, kind: &str) {
    assert_eq!(outcome.status, status, "a refused call gave another status");
    assert_eq!(outcome.success, 0, "a refused call reports success");
    assert!(
        outcome.diagnostics.is_empty(),
        "a refused call carries diagnostics"
    );
    assert_eq!(
        error_field(outcome, "kind"),
        kind,
        "a refused call has another kind"
    );
}

/// One string field of the error JSON, after asserting the error's shape
/// and the bound on its message.
fn error_field(outcome: &Outcome, field: &str) -> String {
    let error: Value = serde_json::from_str(&outcome.error).expect("the error is not JSON");
    let message = error["message"].as_str().expect("the error has no message");
    assert!(error["step"].is_string(), "the error has no step");
    assert_eq!(
        sanitize(message, MAX_MESSAGE),
        message,
        "the error message is over MAX_MESSAGE characters or holds a stripped character"
    );
    error[field].as_str().unwrap_or_default().to_string()
}

/// Calls `shojiku_validate` with `data` and reads the result back through
/// the accessors an SDK uses, then frees it.
fn call(data: &[u8]) -> Outcome {
    let mut handle: *mut ShojikuResult = std::ptr::null_mut();
    // SAFETY: `data` is `data.len()` readable bytes for the whole call, and
    // `handle` is one writable slot.
    let status = unsafe { shojiku_validate(data.as_ptr(), data.len(), &raw mut handle) };
    assert!(!handle.is_null(), "the call returned no result handle");
    let mut success = -1;
    // SAFETY: `handle` is the live handle the call returned, and `success`
    // is one writable `int32_t`.
    let read = unsafe { shojiku_result_success(handle, &raw mut success) };
    assert_eq!(read, SHOJIKU_OK, "reading the success flag failed");
    let outcome = Outcome {
        status,
        success,
        diagnostics: text(handle, shojiku_result_diagnostics_json),
        error: text(handle, shojiku_result_error_json),
    };
    // SAFETY: `handle` is live and freed exactly once, here.
    unsafe { shojiku_result_free(handle) };
    outcome
}

/// The accessor signature shared by the JSON texts of a result.
type Accessor = unsafe extern "C" fn(*const ShojikuResult, *mut *const u8, *mut usize) -> i32;

/// Reads one text of a live result through `accessor`, as UTF-8.
fn text(handle: *const ShojikuResult, accessor: Accessor) -> String {
    let mut ptr: *const u8 = std::ptr::null();
    let mut len = 0;
    // SAFETY: `handle` is live, and `ptr` and `len` are writable slots.
    let read = unsafe { accessor(handle, &raw mut ptr, &raw mut len) };
    assert_eq!(read, SHOJIKU_OK, "reading a result text failed");
    let bytes = if len == 0 {
        &[][..]
    } else {
        // SAFETY: the accessor points `ptr` at `len` bytes owned by the
        // handle, which stays live until `call` frees it.
        unsafe { std::slice::from_raw_parts(ptr, len) }
    };
    String::from_utf8(bytes.to_vec()).expect("a result text is not UTF-8")
}
