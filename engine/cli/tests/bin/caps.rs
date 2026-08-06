//! `shojiku capabilities`: the GUI feature-gating surface.

use super::*;

#[test]
fn capabilities_prints_versioned_feature_list() {
    let out = shojiku(&["capabilities"]);
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&out.stdout).expect("capabilities JSON");
    assert!(value["version"].as_str().is_some());
    let caps = value["capabilities"].as_array().expect("caps");
    assert!(caps.iter().any(|c| c == "inspect.boxes"));
    // Box decoration keys (GUI gating for border + backgroundColor).
    assert!(caps.iter().any(|c| c == "style.border"));
    assert!(caps.iter().any(|c| c == "style.backgroundColor.box"));
    // The textOverflow policy key.
    assert!(caps.iter().any(|c| c == "style.textOverflow"));
    // Item types gate on their own keys, not on a style key.
    assert!(caps.iter().any(|c| c == "qr_code"));
    assert!(caps.iter().any(|c| c == "list"));
    assert!(caps.iter().any(|c| c == "page_break"));
}

#[test]
fn capabilities_lists_diagnostics_v2_keys() {
    let out = shojiku(&["capabilities"]);
    let value: serde_json::Value = serde_json::from_slice(&out.stdout).expect("capabilities JSON");
    let caps = value["capabilities"].as_array().expect("caps");
    assert!(caps.iter().any(|c| c == "diagnostics.args"));
    assert!(caps.iter().any(|c| c == "diagnostics.parse_error"));
}
