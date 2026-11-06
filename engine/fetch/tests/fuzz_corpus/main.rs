//! The `fetch_redirects` fuzz corpus, replayed through the same harness the
//! fuzz target calls.
//!
//! Nothing in CI builds `engine/fuzz`, so this replay runs every committed
//! seed through the harness assertions, and a change that breaks one fails
//! CI between on-demand fuzz runs. A seed whose
//! URL the policy refuses is a pass; a panic (a request to a host outside
//! the default allowlist, too many requests, an unbounded error message) is
//! a failure.

use shojiku_fetch::fuzz::redirect_chain;

/// Every UTF-8 seed committed for one fuzz target.
fn corpus(target: &str) -> Vec<String> {
    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../fuzz/corpus")
        .join(target);
    let mut seeds = Vec::new();
    for entry in std::fs::read_dir(&dir).expect("the corpus directory") {
        let path = entry.expect("a corpus entry").path();
        if let Ok(text) = String::from_utf8(std::fs::read(&path).expect("a corpus file")) {
            seeds.push(text);
        }
    }
    // An empty directory would make every loop run zero times and still pass.
    assert!(!seeds.is_empty(), "{target}: the corpus holds no seeds");
    seeds
}

#[test]
fn every_redirect_chain_seed_stays_on_the_allowlist() {
    let seeds = corpus("fetch_redirects");
    assert!(
        seeds.len() >= 7,
        "the committed redirect-chain seeds are missing"
    );
    let followed = seeds
        .iter()
        .filter(|text| redirect_chain(text) >= 2)
        .count();
    // Positive control: at least one seed follows a redirect hop, so the
    // replay reaches the per-hop check rather than stopping at the first URL.
    assert!(followed >= 1, "no redirect-chain seed follows a redirect");
}
