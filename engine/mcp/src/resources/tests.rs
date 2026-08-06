//! `resources/list` and `resources/read`, including both sides of each
//! size cap and the hostile-URI boundary.

use super::*;
use serde_json::json;

/// A `resources/read` params object.
fn params(uri: &str) -> Value {
    json!({ "uri": uri })
}

/// The error a read is expected to fail with.
fn err(uri: &str) -> RpcError {
    read(&params(uri)).expect_err("should have failed")
}

#[test]
fn list_returns_every_catalog_entry() {
    let listed = list();
    let resources = listed["resources"].as_array().expect("array");
    assert_eq!(resources.len(), 32);
    for resource in resources {
        assert!(resource["uri"]
            .as_str()
            .expect("uri")
            .starts_with("shojiku://example/"));
        assert!(!resource["name"].as_str().expect("name").is_empty());
        assert!(!resource["title"].as_str().expect("title").is_empty());
        assert!(!resource["description"]
            .as_str()
            .expect("description")
            .is_empty());
        assert!(resource["size"].as_u64().expect("size") > 0);
    }
}

#[test]
fn listed_uris_are_unique_and_readable() {
    let listed = list();
    let uris: Vec<&str> = listed["resources"]
        .as_array()
        .expect("array")
        .iter()
        .map(|r| r["uri"].as_str().expect("uri"))
        .collect();
    let unique: std::collections::BTreeSet<&&str> = uris.iter().collect();
    assert_eq!(unique.len(), uris.len(), "duplicate URIs in resources/list");
    // Deterministic order, which `embed::ENTRIES` documents as by-id. The
    // drift gate compares BTreeSets and is order-blind, so without this the
    // documented ordering is unpinned — and a list that reshuffles between
    // calls needlessly invalidates a client's prompt cache.
    let mut sorted = uris.clone();
    sorted.sort_unstable();
    assert_eq!(uris, sorted, "resources/list must stay ordered by id");
    // Everything advertised must actually be fetchable — except the one
    // entry over the bundle cap, which advertises its size honestly.
    for uri in uris {
        let outcome = read(&params(uri));
        if outcome.is_err() {
            assert_eq!(uri, "shojiku://example/dev/layout-showcase");
        }
    }
}

#[test]
fn reading_an_entry_returns_every_source_file() {
    let result = read(&params("shojiku://example/business/invoice-ja")).expect("readable");
    let contents = result["contents"].as_array().expect("contents");
    assert_eq!(contents.len(), 3);
    let names: Vec<&str> = contents
        .iter()
        .map(|c| c["uri"].as_str().expect("uri"))
        .collect();
    assert_eq!(
        names,
        vec![
            "shojiku://example/business/invoice-ja/templates.yml",
            "shojiku://example/business/invoice-ja/definitions.yml",
            "shojiku://example/business/invoice-ja/params.json",
        ]
    );
    assert_eq!(contents[0]["mimeType"], "application/yaml");
    assert_eq!(contents[2]["mimeType"], "application/json");
    // Byte-identity on the BUNDLE path too, not just the single-file one:
    // both go through `part()`, but the plan asked for the served text to be
    // the source and this is the path that serves most of it.
    let entry = examples::find("business/invoice-ja").expect("entry");
    for (content, file) in contents.iter().zip(entry.files) {
        assert_eq!(
            content["text"].as_str().expect("text"),
            file.text,
            "served {} must be the embedded source",
            file.name
        );
    }
}

#[test]
fn a_two_file_entry_returns_two_contents() {
    let result = read(&params("shojiku://example/presets/blank-a4")).expect("readable");
    assert_eq!(result["contents"].as_array().expect("contents").len(), 2);
}

#[test]
fn reading_one_file_returns_exactly_that_file() {
    let result = read(&params(
        "shojiku://example/business/invoice-ja/definitions.yml",
    ))
    .expect("readable");
    let contents = result["contents"].as_array().expect("contents");
    assert_eq!(contents.len(), 1);
    assert_eq!(
        contents[0]["uri"],
        "shojiku://example/business/invoice-ja/definitions.yml"
    );
    let text = contents[0]["text"].as_str().expect("text");
    let embedded = examples::find("business/invoice-ja")
        .expect("entry")
        .file("definitions.yml")
        .expect("file");
    assert_eq!(text, embedded.text, "served text must be the source");
}

#[test]
fn an_oversized_bundle_is_refused_with_its_per_file_uris() {
    // The one entry over the bundle cap: the syntax showcase.
    let error = err("shojiku://example/dev/layout-showcase");
    assert_eq!(error.code, INVALID_PARAMS);
    assert!(error.message.contains("over the"));
    assert!(error.message.contains(&MAX_ENTRY_BYTES.to_string()));
    // The refusal must be ACTIONABLE — it names what to read instead.
    assert!(error
        .message
        .contains("shojiku://example/dev/layout-showcase/templates.yml"));
    assert!(error
        .message
        .contains("shojiku://example/dev/layout-showcase/params.json"));
}

#[test]
fn the_largest_entry_under_the_cap_still_reads() {
    // The negative control for the cap: it must refuse the showcase and
    // nothing else. `delivery-note-ja` is the largest that fits.
    let entry = examples::find("business/delivery-note-ja").expect("entry");
    assert!(entry.size() > 18_000, "expected the largest passing entry");
    assert!(entry.size() <= MAX_ENTRY_BYTES);
    let result = read(&params("shojiku://example/business/delivery-note-ja")).expect("readable");
    assert_eq!(result["contents"].as_array().expect("contents").len(), 3);
}

#[test]
fn the_oversized_entrys_own_file_is_still_reachable_by_name() {
    // The point of splitting the caps: refusing the BUNDLE must not make
    // the file unreadable, or the showcase would be unreachable entirely.
    let result = read(&params(
        "shojiku://example/dev/layout-showcase/templates.yml",
    ))
    .expect("readable by name");
    let text = result["contents"][0]["text"].as_str().expect("text");
    assert!(text.len() > MAX_ENTRY_BYTES, "this is the big one");
}

#[test]
fn an_unknown_entry_is_not_found_and_echoes_the_uri() {
    let error = err("shojiku://example/business/no-such-example");
    assert_eq!(error.code, RESOURCE_NOT_FOUND);
    // The positive control for the echo: a benign URI DOES come back, so
    // "stopped echoing entirely" cannot be mistaken for "correctly bounded".
    assert!(error.message.contains("business/no-such-example"));
    let data = error.data.expect("data member");
    assert_eq!(data["uri"], "shojiku://example/business/no-such-example");
}

#[test]
fn an_unknown_file_inside_a_real_entry_is_not_found() {
    let error = err("shojiku://example/business/invoice-ja/output.pdf");
    assert_eq!(error.code, RESOURCE_NOT_FOUND);
    assert_eq!(
        error.data.expect("data")["uri"],
        "shojiku://example/business/invoice-ja/output.pdf"
    );
}

#[test]
fn a_hostile_uri_is_refused_as_malformed() {
    // Named for what this fixture actually observes. The stronger property —
    // that no caller string can become a filesystem path — is STRUCTURAL, not
    // observable here: the sources are `include_str!`-embedded and the
    // serving path contains no `std::fs`/`PathBuf` at all.
    for hostile in [
        "shojiku://example/business/../../etc/passwd",
        "shojiku://example/%2e%2e%2f%2e%2e%2fetc/passwd",
        "file:///etc/passwd",
        "https://example.com/evil",
        "shojiku://example/business/invoice-ja/../../../Cargo.toml",
    ] {
        let error = err(hostile);
        assert_eq!(
            error.code, INVALID_PARAMS,
            "{hostile} should be refused as malformed"
        );
        assert!(error.message.contains("not a Shojiku example URI"));
    }
}

#[test]
fn a_hostile_uri_echo_is_sanitized_and_clipped() {
    let hostile = format!("shojiku://example/{}", "A".repeat(600));
    let error = err(&hostile);
    assert_eq!(error.code, INVALID_PARAMS);
    // Assert the ECHO itself, not the whole message. A `message.len() < 600`
    // bound leaves more slack (316 bytes) than the budget it claims to prove
    // (200), so a `clip()` regressed to ~315 chars would pass it — and
    // `len()` is the wrong unit besides: `sanitize` clips to MAX_ECHO
    // CHARACTERS, so the same message over a CJK URI is ~3x the bytes while
    // being correctly bounded. The prose and the prefix carry no capital A,
    // so every surviving 'A' is echo.
    assert_eq!(
        error.message.matches('A').count(),
        shojiku_diagnostics::MAX_ECHO - uri::PREFIX.len(),
        "the echo must spend exactly the MAX_ECHO budget: {}",
        error.message
    );

    // Control characters never survive into the message.
    let injected = "shojiku://example/biz/\u{001b}[2Jinvoice";
    let error = err(injected);
    assert!(!error.message.contains('\u{001b}'));
}

#[test]
fn a_missing_or_wrong_typed_uri_is_invalid_params() {
    for bad in [json!({}), json!({ "uri": 42 }), json!({ "uri": null })] {
        let error = read(&bad).expect_err("should have failed");
        assert_eq!(error.code, INVALID_PARAMS);
        assert!(error.message.contains("`uri` is required"));
    }
}

#[test]
fn the_bundle_cap_brackets_the_real_corpus() {
    // Guards the constant against a future example silently crossing it.
    // The per-FILE bound is asserted in `examples::tests`, where the rest
    // of the corpus invariants live.
    let over_bundle = examples::catalog()
        .iter()
        .filter(|entry| entry.size() > MAX_ENTRY_BYTES)
        .count();
    assert_eq!(
        over_bundle, 1,
        "only the showcase should exceed the bundle cap"
    );
}
