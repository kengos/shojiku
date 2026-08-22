//! A locale pack's YAML. Host-supplied data (`packs/locale/<id>.yml`, or
//! bytes a WASM host injects), so it is parsed under the same posture as a
//! template rather than trusted for living on disk.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        if let Ok(pack) = shojiku_formatter::LangPack::from_yaml_str(text) {
            // The accessors a resolver calls on a freshly loaded pack.
            let _ = pack.font_pack_ids();
        }
    }
});
