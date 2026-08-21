//! What the catalog answers: the descriptor's argument contract, the
//! locale-only call, a document's own registry entries, and the parse-only
//! diagnostics that ride along.

use super::{date_sample, descriptor, ok_call, spellings, REGISTRY_TEMPLATE};
use serde_json::{json, Value};

#[test]
fn the_descriptor_takes_a_template_a_locale_and_probes() {
    let tool = descriptor();
    assert_eq!(tool["inputSchema"]["type"], "object");
    let props = tool["inputSchema"]["properties"]
        .as_object()
        .expect("properties");
    let names: Vec<&str> = props.keys().map(String::as_str).collect();
    assert_eq!(names, ["lang", "probes", "template", "templatePath"]);
    assert!(tool["description"].as_str().expect("description").len() > 20);
}

#[test]
fn the_descriptor_requires_nothing_at_all() {
    // Every other template tool demands a template; this one answers the
    // locale's own vocabulary without a document, which is exactly what an
    // author who has not written one yet needs. A flat `required` — or the
    // either-or `allOf` the source-taking tools carry — forbids that call.
    let tool = descriptor();
    assert!(tool["inputSchema"]["required"].is_null());
    assert!(tool["inputSchema"]["allOf"].is_null());
}

#[test]
fn with_no_template_the_locale_vocabulary_still_answers() {
    let (catalog, diags) = ok_call(json!({ "lang": "ja-JP" }));
    let types = catalog["types"].as_array().expect("types");
    // The six BY NAME, not just a count: a count alone is satisfied by a
    // list that names one type twice and drops another.
    let names: Vec<&str> = types
        .iter()
        .map(|t| t["fieldType"].as_str().expect("fieldType"))
        .collect();
    assert_eq!(
        names,
        [
            "date",
            "datetime",
            "currency",
            "number",
            "percentage",
            "quantity"
        ]
    );
    for entry in types {
        let sample = entry["variants"][0]["samples"][0]
            .as_str()
            .expect("a sample");
        assert!(
            !sample.is_empty(),
            "`{}` describes no rendered sample",
            entry["fieldType"]
        );
    }
    // No document, so nothing can be registry-sourced.
    let origins: Vec<&Value> = types
        .iter()
        .flat_map(|t| t["variants"].as_array().expect("variants"))
        .map(|v| &v["origin"])
        .collect();
    assert!(origins.iter().all(|o| *o != "registry"), "{origins:?}");
    assert_eq!(diags, json!([]));
}

#[test]
fn a_template_contributes_its_registry_entries() {
    // Also the positive control for the hostile-name case in `refusals`:
    // without it, "the hostile name is absent" is satisfied by a catalog
    // that reports no registry entry at all.
    let (catalog, _) = ok_call(json!({
        "template": REGISTRY_TEMPLATE,
        "lang": "ja-JP",
    }));
    let entry = catalog["types"]
        .as_array()
        .expect("types")
        .iter()
        .flat_map(|t| t["variants"].as_array().expect("variants"))
        .find(|v| v["spelling"] == "stamp")
        .expect("the registry entry");
    assert_eq!(entry["origin"], "registry");
    assert_eq!(entry["samples"][0], "2026.11.03", "with its own sample");
}

#[test]
fn lang_selects_the_pack_the_samples_come_from() {
    let (ja, _) = ok_call(json!({ "lang": "ja-JP" }));
    let (en, _) = ok_call(json!({ "lang": "en-US" }));
    assert_ne!(
        date_sample(&ja),
        date_sample(&en),
        "the locale never reached the formatter"
    );
}

#[test]
fn a_template_that_cannot_be_parsed_answers_a_catalog_and_says_why() {
    // Not a refusal: an AI that just wrote a broken `formats:` block and got
    // back a registry-free catalog with no reason beside it would conclude
    // the registry does not work.
    let (catalog, diags) = ok_call(json!({
        "template": "formats: [this is not a mapping\n",
        "lang": "ja-JP",
    }));
    assert_eq!(catalog["types"].as_array().expect("types").len(), 6);
    let codes: Vec<&Value> = diags
        .as_array()
        .expect("items")
        .iter()
        .map(|d| &d["code"])
        .collect();
    assert!(codes.iter().any(|c| *c == "parse_error"), "{codes:?}");
}

#[test]
fn a_parseable_template_reports_no_diagnostics_of_its_own() {
    // The tool is not a second `validate`: an empty list here says the file
    // is well-formed, never that the document is valid.
    //
    // The fixture has to be a diagnostic `validate` raises with NO
    // definitions and NO params, because that is what this tool passes.
    // An undeclared binding key is NOT one: `unknown_data_key` sits inside
    // `if let Some(catalog)` and `missing_data` inside `if let Some(params)`
    // (`engine/core/src/validate/bindings.rs`), so asserting an empty list
    // over one is satisfied by every implementation — including a tool that
    // ran the full validate. `reserved_format_name` fires from
    // `check_formats(&Template, &mut Diagnostics)` alone, and it is about
    // the `formats:` registry this tool actually reads.
    let (_, diags) = ok_call(json!({
        "template": concat!(
            "formats:\n",
            "  currency: { type: date, pattern: \"M/d\" }\n",
            "sections:\n",
            "  body: { type: absolute }\n",
        ),
        "lang": "ja-JP",
    }));
    assert_eq!(diags, json!([]));
}

#[test]
fn arguments_the_catalog_does_not_use_are_ignored_not_refused() {
    // A catalog is a function of (locale pack, template registry): no params
    // are read and no fonts are loaded. Unknown arguments are the client's
    // business, and MCP ignores them rather than erroring.
    let (catalog, _) = ok_call(json!({
        "template": REGISTRY_TEMPLATE,
        "lang": "ja-JP",
        "params": "{\"anything\": 1}",
        "definitions": "type: object\n",
    }));
    assert!(spellings(&catalog, "date").iter().any(|s| s == "stamp"));
}
