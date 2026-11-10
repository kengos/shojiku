//! The MCP fuzz corpora (`mcp_frames`, `mcp_uri`), replayed through the
//! same harnesses the fuzz targets call.
//!
//! Nothing in CI builds `engine/fuzz`, so this replay runs every committed
//! seed through the harness assertions, and a change under which any seed
//! fails a harness assertion fails CI between on-demand fuzz runs. Each
//! harness returns the assertions a seed checked on a result a no-op
//! engine would not give, and the replay asserts that some seed checked
//! each one.

use shojiku_mcp::fuzz::{frames, uri};

/// Every seed committed for one fuzz target, as bytes.
fn corpus(target: &str) -> Vec<Vec<u8>> {
    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../fuzz/corpus")
        .join(target);
    let mut seeds = Vec::new();
    for entry in std::fs::read_dir(&dir).expect("the corpus directory") {
        let path = entry.expect("a corpus entry").path();
        seeds.push(std::fs::read(&path).expect("a corpus file"));
    }
    // An empty directory would make every loop run zero times and still pass.
    assert!(!seeds.is_empty(), "{target}: the corpus holds no seeds");
    seeds
}

#[test]
fn every_frame_seed_keeps_the_transport_properties() {
    let seeds = corpus("mcp_frames");
    assert!(seeds.len() >= 9, "the committed frame seeds are missing");
    let paths: Vec<_> = seeds.iter().map(|bytes| frames(bytes)).collect();
    for (ran, what) in [
        (paths.iter().any(|p| p.line), "a line within the cap"),
        (paths.iter().any(|p| p.oversized), "a line over the cap"),
        (
            paths.iter().any(|p| p.parse_error),
            "a line that is not JSON",
        ),
        (
            paths.iter().any(|p| p.not_object),
            "JSON that is not an object",
        ),
        (
            paths.iter().any(|p| p.missing_method),
            "a request with no method",
        ),
        (paths.iter().any(|p| p.notification), "a notification"),
        (paths.iter().any(|p| p.unknown_method), "an unknown method"),
        (
            paths.iter().any(|p| p.echo_clipped),
            "an unknown method longer than MAX_ECHO",
        ),
        (
            paths.iter().any(|p| p.result),
            "a method the server always answers, answered with a result",
        ),
        (
            paths.iter().any(|p| p.method_error),
            "a `resources/read` with no string uri, answered with invalid params",
        ),
    ] {
        assert!(ran, "no frame seed runs {what}");
    }
}

#[test]
fn every_uri_seed_keeps_the_grammar_and_answer_properties() {
    let seeds: Vec<String> = corpus("mcp_uri")
        .into_iter()
        .filter_map(|bytes| String::from_utf8(bytes).ok())
        .collect();
    assert!(seeds.len() >= 10, "the committed URI seeds are missing");
    let paths: Vec<_> = seeds.iter().map(|text| uri(text)).collect();
    for (ran, what) in [
        (
            paths.iter().any(|p| p.reference_page),
            "a whole reference page",
        ),
        (
            paths.iter().any(|p| p.reference_fragment),
            "a reference fragment",
        ),
        (
            paths.iter().any(|p| p.example_entry),
            "a whole example entry",
        ),
        (paths.iter().any(|p| p.example_file), "one example file"),
        (
            paths.iter().any(|p| p.over_bundle_cap),
            "an entry over the bundle cap",
        ),
        (
            paths.iter().any(|p| p.reference_not_found),
            "an accepted reference URI that names nothing",
        ),
        (
            paths.iter().any(|p| p.example_not_found),
            "an accepted example URI that names nothing",
        ),
        (
            paths.iter().any(|p| p.reference_malformed),
            "a reference URI the parser refuses",
        ),
        (
            paths.iter().any(|p| p.example_malformed),
            "an example URI the parser refuses",
        ),
        (
            paths.iter().any(|p| p.echo_clipped),
            "an error for a URI longer than the echo bound",
        ),
    ] {
        assert!(ran, "no URI seed runs {what}");
    }
}
