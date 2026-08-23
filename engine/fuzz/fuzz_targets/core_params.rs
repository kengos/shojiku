//! `params`: caller-supplied runtime data, parsed as YAML-or-JSON.
//!
//! The one input that is attacker-controlled in ordinary production use —
//! a template is authored, params come from whatever the calling
//! application received.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        if let Ok(value) = shojiku_core::parse_params(text) {
            // Resolution is where a parsed tree is actually walked; parsing
            // alone would leave the traversal unfuzzed.
            let _ = shojiku_core::resolve_path(&value, "a.b.c");
        }
    }
});
