//! The template wire: arbitrary text through the authored-document parser.
//!
//! This is the widest door in the engine — a dozen-plus wire surfaces (page,
//! sections, every item type, styles, tables, bindings) sit behind this one
//! call, so one target covers them all. Non-UTF-8 input is discarded rather
//! than lossily converted: the hosts hand this function a `&str`, so bytes
//! that are not text never reach it and fuzzing them would measure the
//! decoder instead of the parser.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        if let Ok(template) = shojiku_core::parse_template(text) {
            // Walk the parsed model, not just the parse. This is the widest
            // door in the engine, so stopping at `Ok` would fuzz the least
            // of it: `validate` is what descends every section, item and
            // binding the parse only shaped.
            let _ = shojiku_core::validate(None, &template, None);
        }
    }
});
