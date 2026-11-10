//! The `capi_request` fuzz corpus, replayed through the same harness the
//! fuzz target calls.
//!
//! Nothing in CI builds `engine/fuzz`, so this replay runs every committed
//! seed through the harness assertions, and a change under which any seed
//! fails a harness assertion fails CI between on-demand fuzz runs. The
//! harness returns the assertions a seed checked on a result a no-op
//! engine would not give, and the replay asserts that some seed checked
//! each one.

use shojiku_capi::fuzz::request;

#[test]
fn every_request_seed_keeps_the_c_abi_properties() {
    let dir =
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../fuzz/corpus/capi_request");
    let mut seeds = Vec::new();
    for entry in std::fs::read_dir(&dir).expect("the corpus directory") {
        let path = entry.expect("a corpus entry").path();
        seeds.push(std::fs::read(&path).expect("a corpus file"));
    }
    assert!(seeds.len() >= 10, "the committed request seeds are missing");
    let paths: Vec<_> = seeds.iter().map(|bytes| request(bytes)).collect();
    for (ran, what) in [
        (
            paths.iter().any(|p| p.invalid_utf8),
            "bytes that are not UTF-8",
        ),
        (
            paths.iter().any(|p| p.invalid_request),
            "an envelope the parser refuses",
        ),
        (
            paths.iter().any(|p| p.scale_refused),
            "an envelope refused only for its scale",
        ),
        (
            paths.iter().any(|p| p.too_many_ids),
            "an envelope refused only for an id list over 256 entries",
        ),
        (paths.iter().any(|p| p.valid), "a document that validates"),
        (
            paths.iter().any(|p| p.refused),
            "a document refused with errors",
        ),
    ] {
        assert!(ran, "no request seed runs {what}");
    }
}
