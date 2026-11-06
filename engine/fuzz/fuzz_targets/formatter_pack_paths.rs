//! A locale pack's `fonts.uses` and an injected font-pack manifest, resolved
//! by both bytes-first resolvers. Unlike `formatter_fontpack`, whose locale
//! pack is fixed, this target varies both halves and supplies bytes for
//! every declared `file`, so a face is refused only by a resolver check.
//! The checks: no face resolves from an absolute `file` or one with a `..`
//! segment, the strict
//! and the subset resolver agree, and an id the pack-id or locale-id check
//! accepts is one path segment.
//!
//! The harnesses live in `shojiku_formatter::fuzz` and
//! `shojiku_authoring::fuzz`, and the two crates' corpus replay tests run
//! the same harnesses.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        let _ = shojiku_formatter::fuzz::pack_paths(text);
        let _ = shojiku_authoring::fuzz::locale_id(text);
    }
});
