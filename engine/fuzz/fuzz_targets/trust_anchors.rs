//! Trust anchors from caller-supplied PEM.
//!
//! Caller-supplied, not document-supplied — but the caller is a CLI flag
//! pointing at a file, so the bytes are as arbitrary as any other input. It
//! is also the site of a known upstream underflow: the PEM chain decoder
//! computes `len - 1` after stripping trailing newlines, which panics on
//! empty input in a debug build, so the guard in front of it is exactly the
//! kind of thing a fuzzer should keep honest.
#![no_main]

use libfuzzer_sys::fuzz_target;
use shojiku_verify::TrustAnchors;

fuzz_target!(|data: &[u8]| {
    let _ = TrustAnchors::from_pem(data);
});
