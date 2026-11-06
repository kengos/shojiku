//! A `link:` URL after interpolation: params control it, and layout's gate
//! decides whether it reaches a PDF `/URI` action. Every URL the gate
//! accepts is checked against the rule the gate documents (trimmed, within
//! the length cap, no control character, an allowed scheme).
//!
//! The harness lives in `shojiku_layout::fuzz`, where the corpus replay test
//! runs the same code.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        let _ = shojiku_layout::fuzz::link_url(text);
    }
});
