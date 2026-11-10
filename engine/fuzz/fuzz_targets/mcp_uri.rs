//! `shojiku://reference/…` and `shojiku://example/…` URIs, one per line,
//! through `resources/read` and the read tool. The checks: an accepted URI
//! is made of grammar segments and rebuilds to itself, a refused one is
//! invalid params, an accepted one is answered with its own contents or
//! not found, an error echoes a bounded part of the URI, the tool answers
//! what the resource read answers, and the same URI gets the same answer
//! twice.
//!
//! The harness is in `shojiku_mcp::fuzz`, where the corpus replay test runs
//! the same code.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        let _ = shojiku_mcp::fuzz::uri(text);
    }
});
