//! `definitions`: the OpenAPI-shaped data dictionary, which carries its own
//! recursive schema walk (depth and node caps) on top of the YAML parse.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        if let Ok(defs) = shojiku_core::parse_definitions(text) {
            // The catalog flattens the schema tree — the recursive half, and
            // the reason parsing alone is not enough here.
            let _ = shojiku_core::Catalog::from_definitions(&defs);
        }
    }
});
