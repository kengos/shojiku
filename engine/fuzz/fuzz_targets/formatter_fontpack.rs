//! A font pack's `manifest.yml`. The other host-supplied YAML, and the one
//! whose parsed content names FILES.
//!
//! The target deliberately goes through `resolve_face_bytes` with an
//! injected pack rather than calling `face_specs` directly: `face_specs` is
//! a clone-and-`join` with no validation, so a manifest declaring
//! `file: ../../../etc/passwd` would sail through it, whereas the real
//! resolvers call the path-confinement check FIRST. A target that stopped at
//! `face_specs` would carry a traversal seed that exercised nothing.
#![no_main]

use libfuzzer_sys::fuzz_target;
use shojiku_formatter::{resolve_face_bytes, InjectedPack, LangPack, PackManifest};

fuzz_target!(|data: &[u8]| {
    let Ok(text) = std::str::from_utf8(data) else {
        return;
    };
    // The parse itself, so a manifest that never resolves is still fuzzed.
    let _ = PackManifest::from_yaml(text);

    // …and the resolution path, which is where confinement lives. The locale
    // pack names the injected pack so the walk actually reaches it.
    let Ok(pack) = LangPack::from_yaml_str("id: xx\nfonts:\n  uses: [fuzz]\n  default: fuzz\n")
    else {
        return;
    };
    let injected = vec![InjectedPack {
        id: "fuzz".to_string(),
        manifest: text.to_string(),
        files: std::collections::BTreeMap::new(),
    }];
    let _ = resolve_face_bytes(&pack, injected);
});
