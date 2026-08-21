//! The `probes` argument: previewing a pattern the document does not carry
//! yet, and the two caps — one refusing the CALL, one refusing one PROBE.

use super::{descriptor, ok_call};
use serde_json::json;
use shojiku_authoring::{MAX_PROBES, MAX_PROBE_PATTERN};

#[test]
fn the_probe_schema_pins_its_vocabulary_and_caps_by_value() {
    // An AI client reads which types have a pattern form, and both caps,
    // straight out of the schema rather than by trial and error.
    let probes = descriptor()["inputSchema"]["properties"]["probes"].clone();
    assert_eq!(probes["type"], "array");
    assert_eq!(probes["maxItems"], json!(MAX_PROBES));
    assert_eq!(probes["items"]["type"], "object");
    assert_eq!(
        probes["items"]["properties"]["fieldType"]["enum"],
        json!(["date", "datetime"])
    );
    // The LENGTH cap is deliberately NOT a `maxLength` constraint: the
    // server accepts an over-long pattern and answers `refused` in that
    // probe's own slot, so declaring it invalid would tell a validating
    // client not to send the one input that reaches that answer. It stays
    // discoverable in the description instead.
    assert!(probes["items"]["properties"]["pattern"]["maxLength"].is_null());
    assert!(probes["description"]
        .as_str()
        .expect("description")
        .contains(&MAX_PROBE_PATTERN.to_string()));
    assert_eq!(probes["items"]["required"], json!(["fieldType", "pattern"]));
}

#[test]
fn a_probe_previews_a_pattern_the_document_does_not_contain() {
    let (catalog, _) = ok_call(json!({
        "lang": "ja-JP",
        "probes": [{ "fieldType": "date", "pattern": "yyyy年M月d日" }],
    }));
    let probe = &catalog["probes"][0];
    assert!(probe["refused"].is_null(), "{probe}");
    assert!(
        probe["sample"].as_str().expect("sample").contains('年'),
        "{probe}"
    );
}

#[test]
fn a_datetime_probe_renders_through_the_datetime_dispatch() {
    // The other half of the enum the schema declares: both spellings parse,
    // and each reaches its own dispatch arm.
    let (catalog, _) = ok_call(json!({
        "lang": "ja-JP",
        "probes": [{ "fieldType": "datetime", "pattern": "HH:mm" }],
    }));
    let sample = catalog["probes"][0]["sample"]
        .as_str()
        .expect("sample")
        .to_string();
    assert!(sample.contains(':'), "{sample}");
}

#[test]
fn an_over_long_pattern_refuses_one_probe_rather_than_the_call() {
    // The COUNT cap is a shape the schema declares, so it refuses the call
    // (see `refusals`). A pattern past the LENGTH cap names WHICH probe was
    // too long, which one flat protocol error could not — so it rides the
    // catalog instead.
    let long = "y".repeat(MAX_PROBE_PATTERN + 1);
    let (catalog, _) = ok_call(json!({
        "lang": "ja-JP",
        "probes": [
            { "fieldType": "date", "pattern": "yyyy" },
            { "fieldType": "date", "pattern": long },
        ],
    }));
    assert!(catalog["probes"][0]["refused"].is_null());
    assert_eq!(catalog["probes"][1]["refused"], "patternTooLong");
    assert_eq!(catalog["probes"][1]["sample"], "");
}
