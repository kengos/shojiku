//! A request envelope through the C ABI's `shojiku_validate`, read back
//! through the result accessors and freed. The checks: the status is never
//! `SHOJIKU_ERR_PANIC` (the C ABI turns a panic into that status, which
//! the corpus replay test reports as a failure of the never-`SHOJIKU_ERR_PANIC`
//! assertion), bytes that are not UTF-8 and envelopes the parser refuses
//! get their own statuses, an accepted one succeeds exactly when its
//! diagnostics hold no error, the result texts are JSON with a bounded
//! error message, and the same input gives the same result twice.
//!
//! The harness is in `shojiku_capi::fuzz`, where the corpus replay test
//! runs the same code.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let _ = shojiku_capi::fuzz::request(data);
});
