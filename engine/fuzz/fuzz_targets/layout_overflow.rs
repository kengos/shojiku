//! A definite-height text block that overflows: the `shrink` font-size
//! search, the `ellipsis` line clamp and the single-line clamp a `list`
//! entry uses. The checks: the shrunk size stays between the floor and the
//! authored size and fits whenever it is above the floor, and a clamped
//! line is a prefix of the original that fits with its `…` and does not
//! end in an opening bracket or quote.
//!
//! The harness is in `shojiku_layout::fuzz`, where the corpus replay
//! test runs the same code.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        let _ = shojiku_layout::fuzz::overflow(shojiku_fuzz::text_chain(), text);
    }
});
