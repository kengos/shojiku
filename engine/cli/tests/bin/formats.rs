//! `shojiku formats`: the format catalog as a command.
//!
//! The catalog's own behaviour is unit-tested next to `run_formats`; what
//! only the spawned binary can show is that the subcommand is REACHABLE —
//! that it parses, dispatches, and puts the catalog on stdout rather than
//! into a diagnostic.

use super::*;

#[test]
fn formats_prints_the_catalog_for_a_locale() {
    let out = shojiku(&["formats", "--lang", "ja-JP"]);
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&out.stdout).expect("catalog JSON");
    let types = value["types"].as_array().expect("types");
    // Every type the format layer applies to is described, and each one says
    // what it renders — the whole point of asking the engine instead of
    // keeping a table by hand.
    for expected in [
        "date",
        "datetime",
        "number",
        "currency",
        "percentage",
        "quantity",
    ] {
        let entry = types
            .iter()
            .find(|t| t["fieldType"] == expected)
            .unwrap_or_else(|| panic!("`{expected}` missing from the catalog"));
        assert!(
            !entry["variants"][0]["samples"][0]
                .as_str()
                .expect("a sample")
                .is_empty(),
            "`{expected}` describes no rendered sample"
        );
    }
}

#[test]
fn a_probe_previews_a_pattern_the_document_does_not_contain() {
    let out = shojiku(&["formats", "--lang", "ja-JP", "--probe", "date:yyyy年M月d日"]);
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&out.stdout).expect("catalog JSON");
    let probes = value["probes"].as_array().expect("probes");
    assert_eq!(probes.len(), 1);
    assert!(
        probes[0]["sample"]
            .as_str()
            .expect("a sample")
            .contains('年'),
        "the probed pattern was not rendered: {}",
        probes[0]
    );
    assert!(
        probes[0]["refused"].is_null(),
        "a valid pattern is not refused"
    );
}

#[test]
fn a_malformed_probe_fails_the_command_rather_than_printing_a_catalog() {
    // The usage error must reach the process exit status: a catalog printed
    // beside a rejected probe would read as though the probe had been honoured.
    let out = shojiku(&["formats", "--lang", "ja-JP", "--probe", "yyyy"]);
    assert!(
        !out.status.success(),
        "a probe with no type must not succeed"
    );
    assert!(out.stdout.is_empty(), "no catalog is printed on failure");
}
