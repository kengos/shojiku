//! Aozora ruby (`｜base《reading》`): a hand-written scanner over authored
//! text, so the one core door that is not serde.
//!
//! It never fails — it returns segments plus warnings — which makes it
//! exactly the shape where a fuzzer earns its keep: the bug would be a
//! panic on a boundary (an orphan delimiter, a `《` with no `》`, a marker
//! split across a character boundary), not a rejected input.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        let (segments, _warnings) = shojiku_core::parse_aozora_ruby(text);
        // Touch every segment: a scanner bug shows up as a byte range that
        // does not line up with the input it was cut from.
        for segment in &segments {
            let _ = format!("{segment:?}");
        }
    }
});
