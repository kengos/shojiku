//! A `row`'s unsized children through the flex distribution. The checks:
//! every resolved size is finite, non-negative and one per item, and the
//! same row resolves the same twice; with a finite free space the spacing,
//! auto-margin and grow shares are finite and never distribute more than
//! the free space; for values a caller can pass, every size is within its
//! bounds, a row with room and no weight gives every child its basis
//! clamped to its bounds, and otherwise, with no bounds, the sizes add up
//! to the free space (to zero when the free space is negative).
//!
//! The harness is in `shojiku_layout_box::fuzz`, where the corpus replay
//! test runs the same code.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        let _ = shojiku_layout_box::fuzz::flex(text);
    }
});
