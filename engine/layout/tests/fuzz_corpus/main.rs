//! The layout fuzz corpora (`link_url` and the `text` group), replayed
//! through the same harnesses the fuzz targets call.
//!
//! Nothing in CI builds `engine/fuzz`, so this replay runs every committed
//! seed through the harness assertions, and a change that breaks one fails
//! CI between on-demand fuzz runs. A seed the
//! link-URL gate refuses is a pass; an accepted URL that breaks the gate's
//! documented rule is a panic. Each text harness returns which of its
//! checked branches a seed ran, and every text replay asserts that some seed
//! runs each of them, so the replay fails when no seed runs one of the
//! checked branches.

use shojiku_layout::FontFace;
use shojiku_layout::fuzz::{link_url, overflow, shape, text_chain, wrap};
use std::sync::OnceLock;

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

/// The fuzzed font chain, loaded once for this test binary from the same
/// `packs/fonts` directory the fuzz targets read.
fn chain() -> &'static [FontFace] {
    static CHAIN: OnceLock<Vec<FontFace>> = OnceLock::new();
    CHAIN.get_or_init(|| {
        text_chain(&std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packs/fonts"))
    })
}

#[test]
fn every_wrap_seed_keeps_the_wrapping_properties() {
    let seeds = corpus("layout_wrap");
    assert!(seeds.len() >= 13, "the committed wrap seeds are missing");
    let paths: Vec<_> = seeds.iter().map(|text| wrap(chain(), text)).collect();
    // Positive controls: the width rule ran on a line wider than the box
    // and on lines within it, kinsoku or hanging moved a character, and a
    // line was marked hung.
    assert!(
        paths.iter().any(|p| p.width_checked && p.over_wide),
        "no wrap seed has a line wider than the box under the width rule"
    );
    assert!(
        paths.iter().any(|p| p.width_checked && !p.over_wide),
        "no wrap seed fits the box under the width rule"
    );
    assert!(
        paths.iter().any(|p| p.over_wide_after_prefix),
        "no wrap seed has a line wider than the box with characters before its last unit"
    );
    assert!(
        paths.iter().any(|p| p.rule_moved),
        "no wrap seed has kinsoku or hanging move a character"
    );
    assert!(paths.iter().any(|p| p.hung), "no wrap seed has a hung line");
}

#[test]
fn every_shape_seed_keeps_the_shaping_properties() {
    let seeds = corpus("layout_shape");
    assert!(seeds.len() >= 9, "the committed shape seeds are missing");
    let paths: Vec<_> = seeds.iter().map(|text| shape(chain(), text)).collect();
    // Positive controls: a segment some chain face covers, a character no
    // face maps, and a glyph that trimming narrowed.
    assert!(
        paths.iter().any(|p| p.shaped),
        "no shape seed has a segment a chain face covers"
    );
    assert!(
        paths.iter().any(|p| p.missing),
        "no shape seed holds a character no face maps"
    );
    assert!(
        paths.iter().any(|p| p.trimmed),
        "no shape seed has trimming narrow a glyph"
    );
}

#[test]
fn every_overflow_seed_keeps_the_overflow_properties() {
    let seeds = corpus("layout_overflow");
    assert!(seeds.len() >= 9, "the committed overflow seeds are missing");
    let paths: Vec<_> = seeds.iter().map(|text| overflow(chain(), text)).collect();
    // Positive controls: the shrink search returned a size above the floor
    // and the floor itself, each clamp shortened a line, the ellipsis clamp
    // kept a non-empty prefix, and some seed needs neither policy.
    assert!(
        paths.iter().any(|p| p.shrunk_above_floor),
        "no overflow seed shrinks to a size above the floor"
    );
    assert!(
        paths.iter().any(|p| p.shrunk_to_floor),
        "no overflow seed shrinks to the floor"
    );
    assert!(
        paths.iter().any(|p| p.clamped_nonempty),
        "no overflow seed is clamped to a non-empty prefix"
    );
    assert!(
        paths.iter().any(|p| p.single_clamped),
        "no overflow seed has a first line the single-line clamp shortens"
    );
    assert!(
        paths
            .iter()
            .any(|p| *p == shojiku_layout::fuzz::OverflowPaths::default()),
        "every overflow seed is shrunk or clamped"
    );
}
