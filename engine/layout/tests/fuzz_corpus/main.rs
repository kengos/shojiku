//! The `link_url` fuzz corpus, replayed through the same harness the fuzz
//! target calls.
//!
//! Nothing in CI builds `engine/fuzz`, so this replay runs every committed
//! seed through the harness assertions, and a change that breaks one fails
//! CI between on-demand fuzz runs. A seed the
//! link-URL gate refuses is a pass; an accepted URL that breaks the gate's
//! documented rule is a panic.

use shojiku_layout::fuzz::link_url;

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
fn every_link_url_seed_is_accepted_by_the_rule_or_refused() {
    let seeds = corpus("link_url");
    assert!(seeds.len() >= 8, "the committed link-URL seeds are missing");
    let accepted = seeds.iter().filter(|text| link_url(text)).count();
    // Positive and negative control: the corpus holds URLs the gate accepts
    // (so the assertions run) and URLs it refuses.
    assert!(accepted >= 1, "no link-URL seed is accepted");
    assert!(accepted < seeds.len(), "no link-URL seed is refused");
}
