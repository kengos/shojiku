//! One params value bound to an image item, loaded under a host policy
//! (mode, allow and deny lists, byte and pixel caps) against a fixed set of
//! injected files. The checks: a remote URL never becomes an asset, a
//! bundled path loads exactly when it has no `..` segment, does not start
//! with `/`, and names an injected file within the byte and pixel caps, a
//! `..` or absolute path is reported as traversal, a denied item or
//! disallowed inline content gets no asset, every asset is within the
//! caps, and a second load of the same value gives the same asset and the
//! same diagnostics.
//!
//! The harness is in `shojiku_image::fuzz`, where the corpus replay test
//! runs the same code.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        let _ = shojiku_image::fuzz::source(text);
    }
});
