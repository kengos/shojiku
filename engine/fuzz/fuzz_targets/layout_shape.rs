//! A run of params text, shaped over the Latin, Japanese, Thai and
//! Devanagari fallback chain with letter spacing and punctuation trimming.
//! The checks: every glyph's source range is a slice of the text on
//! character boundaries and together they cover it (the PDF ToUnicode map
//! is built from them), pen positions are the running sum of the advances,
//! every glyph id exists in its face, and trimming keeps every glyph and
//! never widens one; the glyph count is also checked against harfrust's
//! buffer cap, as a guard against a harfrust change.
//!
//! The harness is in `shojiku_layout::fuzz`, where the corpus replay
//! test runs the same code.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        let _ = shojiku_layout::fuzz::shape(shojiku_fuzz::text_chain(), text);
    }
});
