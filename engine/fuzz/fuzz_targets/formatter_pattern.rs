//! A date/datetime pattern from a template's `formats:` registry, rendered
//! against the ja-JP pack with a hostile overlay of its era and name tables.
//! The checks: `LangPack::era_for` never returns an era year below 1 for
//! the value's date, and the rendered length is bounded by the pattern
//! length.
//!
//! The harness lives in `shojiku_formatter::fuzz`, where the corpus replay
//! test runs the same code.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        let _ = shojiku_formatter::fuzz::date_pattern(text);
    }
});
