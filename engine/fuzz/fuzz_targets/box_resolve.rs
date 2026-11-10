//! Lengths through `resolve_x`, `resolve_y` and `clamp_size`, and grid
//! tracks through `equal_track` and `track_offsets`. The checks: a kept
//! length is the in-range value `Length::resolve` gives and a dropped one
//! adds exactly one diagnostic, and a clamped size is within finite
//! bounds. Equal tracks stay finite and fill the total when they fit, for
//! a total and gap a caller can pass. Each offset is the previous offset
//! plus the previous track and the gap, for finite non-negative sizes and
//! gap.
//!
//! The harness is in `shojiku_layout_box::fuzz`, where the corpus replay
//! test runs the same code.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        let _ = shojiku_layout_box::fuzz::resolve(text);
    }
});
