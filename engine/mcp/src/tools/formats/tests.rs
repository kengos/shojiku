//! `format_catalog` tests: the shared fixtures and accessors, split by
//! subject into `catalog` (what it answers), `probes` (the pattern preview
//! argument) and `refusals` (what a hostile or mistaken client reaches).

mod catalog;
mod probes;
mod refusals;

use crate::test_support::{call_tool, content, diag_items, text_json};
use serde_json::Value;

/// A document whose `formats:` registry contributes one pickable entry.
const REGISTRY_TEMPLATE: &str = concat!(
    "formats:\n",
    "  stamp: { type: date, pattern: \"yyyy.MM.dd\" }\n",
    "sections:\n",
    "  body:\n",
    "    type: flow\n",
    "    items: []\n",
);

/// Calls the tool and returns `(catalog, the diagnostics items)` from a
/// result that must not be an error. Pins the two-part bundle shape as a
/// side effect: the catalog first, its diagnostics last.
fn ok_call(arguments: Value) -> (Value, Value) {
    let result = call_tool("format_catalog", arguments).expect("format_catalog");
    assert_eq!(result["isError"], false, "{result}");
    let parts = content(&result);
    assert_eq!(parts.len(), 2, "catalog then diagnostics: {result}");
    (text_json(&parts[0]), diag_items(&parts[1]))
}

/// The spellings offered for one field type.
fn spellings(catalog: &Value, field_type: &str) -> Vec<String> {
    let types = catalog["types"].as_array().expect("types");
    let entry = types
        .iter()
        .find(|t| t["fieldType"] == field_type)
        .unwrap_or_else(|| panic!("`{field_type}` missing from the catalog"));
    entry["variants"]
        .as_array()
        .expect("variants")
        .iter()
        .map(|v| v["spelling"].as_str().expect("spelling").to_string())
        .collect()
}

/// The default `date` sample, which differs per locale pack.
fn date_sample(catalog: &Value) -> String {
    let types = catalog["types"].as_array().expect("types");
    let date = types
        .iter()
        .find(|t| t["fieldType"] == "date")
        .expect("date");
    date["variants"][0]["samples"][0]
        .as_str()
        .expect("sample")
        .to_string()
}

/// The tool's own descriptor, found by NAME the way a client finds it.
fn descriptor() -> Value {
    crate::tools::schema::descriptors()
        .as_array()
        .expect("descriptors")
        .iter()
        .find(|t| t["name"] == "format_catalog")
        .expect("the format_catalog descriptor")
        .clone()
}
