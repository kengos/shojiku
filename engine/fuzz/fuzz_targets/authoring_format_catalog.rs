//! A template's `formats:` registry and pattern probes through the format
//! catalog. The checks: the types are the fixed list, each type's
//! spellings are distinct, pickable and include `default`, a registry
//! spelling is listed first and only on its own type, each probe is
//! refused past its caps and not refused otherwise, and the same input
//! gives the same catalog twice.
//!
//! The harness is in `shojiku_authoring::fuzz`, where the corpus replay
//! test runs the same code.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        let _ = shojiku_authoring::fuzz::catalog(text);
    }
});
