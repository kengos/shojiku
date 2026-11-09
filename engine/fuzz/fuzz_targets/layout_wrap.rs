//! A text block's params text, wrapped into lines: any string, split into
//! up to four rich spans, at any width, size, spacing, line-break mode,
//! hanging mode and writing direction the style guards admit. The checks:
//! no character is lost or duplicated, every paragraph gives at least one
//! line and the line count is at most the character count plus the
//! paragraph count, a line wider than the box overflows only in its last
//! unit that cannot be split (the characters before that unit fit the
//! box), and a hung line ends in its hanging punctuation.
//!
//! The harness is in `shojiku_layout::fuzz`, where the corpus replay
//! test runs the same code.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        let _ = shojiku_layout::fuzz::wrap(shojiku_fuzz::text_chain(), text);
    }
});
