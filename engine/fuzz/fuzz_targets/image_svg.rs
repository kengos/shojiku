//! SVG markup from a template `src:` or a params value, through the subset
//! parser. The checks: an accepted tree has a viewBox within the size
//! limits, every path point within 1000 viewBox widths and heights, a
//! stroke width and gradient numbers within their limits, color channels
//! and stop opacities in 0..=1, stop offsets non-decreasing in 0..=1, 1 to
//! 256 stops, at most one path command per input byte, no repeated
//! warning, and the same result on a second parse.
//!
//! The harness is in `shojiku_image::fuzz`, where the corpus replay test
//! runs the same code.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        let _ = shojiku_image::fuzz::svg(text);
    }
});
