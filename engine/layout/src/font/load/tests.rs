//! Unit tests for the bytes-first `load_from_injected` constructor: it
//! carries the same sha256/fsType verification and locale fallback chain as
//! the filesystem `load_from_pack` (the gap the test-only `from_faces` has),
//! and rejects tampered or unparsable injected bytes.

use crate::font::test_support::{ja_store, repo_font_dir};
use crate::font::{FontError, FontStore};
use sha2::{Digest, Sha256};
use shojiku_core::{FontStyle, FontWeight};
use shojiku_formatter::{resolve_face_specs, InjectedPack, LangPack};
use std::collections::BTreeMap;

fn ja_pack() -> LangPack {
    LangPack::builtin("ja-JP", None)
        .expect("parse builtin ja-JP")
        .expect("builtin ja-JP exists")
}

#[test]
fn load_from_specs_builds_the_store_from_resolved_faces() {
    // The seam the CLI drives directly: resolve, (a host may fetch here), load.
    let pack = ja_pack();
    let specs = resolve_face_specs(&pack, &[repo_font_dir()]).expect("resolve");
    let store = FontStore::load_from_specs(specs, &pack).expect("load");
    assert_eq!(store.default_id(), pack.default_font().unwrap());
    // The fallback chain is carried, same as the whole-pack loader.
    let chain = store.resolve_chain(
        Some(store.default_id()),
        FontWeight::Normal,
        FontStyle::Normal,
    );
    assert!(!chain.fallback_ids.is_empty());
}

#[test]
fn load_from_specs_with_no_faces_is_no_fonts() {
    // A host that resolved (or fetched) nothing must fail loudly, not build an
    // empty store.
    let err = FontStore::load_from_specs(Vec::new(), &ja_pack()).unwrap_err();
    assert!(matches!(err, FontError::NoFonts(_)));
}

fn sha_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .fold(String::new(), |mut s, b| {
            s.push_str(&format!("{b:02x}"));
            s
        })
}

/// Real face bytes from the loaded ja pack (so they parse + fsType-pass).
fn face_bytes(id: &str) -> Vec<u8> {
    ja_store().get(id).unwrap().data.as_ref().clone()
}

fn injected(id: &str, manifest: String, files: &[(&str, Vec<u8>)]) -> Vec<InjectedPack> {
    let mut map = BTreeMap::new();
    for (name, bytes) in files {
        map.insert((*name).to_string(), bytes.clone());
    }
    vec![InjectedPack {
        id: id.to_string(),
        manifest,
        files: map,
    }]
}

#[test]
fn injected_loads_with_verification_and_fallback_chain() {
    let a = face_bytes("biz-udp-gothic");
    let b = face_bytes("noto-sans-mono");
    let manifest = format!(
        "version: 1\nlicense: X\nfaces:\n  \
         - id: a\n    file: a.ttf\n    sha256: {}\n  \
         - id: b\n    file: b.ttf\n    sha256: {}\n",
        sha_hex(&a),
        sha_hex(&b),
    );
    let packs = injected("p", manifest, &[("a.ttf", a), ("b.ttf", b)]);
    let pack =
        LangPack::from_yaml_str("id: xx\nfonts:\n  uses: [p]\n  default: a\n  fallback: [b]\n")
            .unwrap();
    let store = FontStore::load_from_injected(&pack, packs).unwrap();
    assert_eq!(store.default_id(), "a");
    assert_eq!(store.face_ids().len(), 2);
    // The fallback chain — absent from `from_faces` — is carried through:
    // resolving `a` yields `b` as its fallback.
    let chain = store.resolve_chain(Some("a"), FontWeight::Normal, FontStyle::Normal);
    assert_eq!(chain.fallback_ids, vec!["b".to_string()]);
}

#[test]
fn injected_rejects_tampered_sha256() {
    let a = face_bytes("biz-udp-gothic");
    // Real (parsable) bytes but a wrong declared hash → verification fails.
    let manifest =
        "version: 1\nlicense: X\nfaces:\n  - id: a\n    file: a.ttf\n    sha256: deadbeef\n"
            .to_string();
    let packs = injected("p", manifest, &[("a.ttf", a)]);
    let pack = LangPack::from_yaml_str("id: xx\nfonts:\n  uses: [p]\n  default: a\n").unwrap();
    let err = FontStore::load_from_injected(&pack, packs).unwrap_err();
    assert!(matches!(err, FontError::Sha256Mismatch(ref id) if id == "a"));
}

#[test]
fn injected_rejects_unparsable_font_bytes() {
    // Garbage bytes whose declared hash matches: parsing must fail (not
    // panic) before verification even runs.
    let garbage = b"this is not a font".to_vec();
    let manifest = format!(
        "version: 1\nlicense: X\nfaces:\n  - id: a\n    file: a.ttf\n    sha256: {}\n",
        sha_hex(&garbage),
    );
    let packs = injected("p", manifest, &[("a.ttf", garbage)]);
    let pack = LangPack::from_yaml_str("id: xx\nfonts:\n  uses: [p]\n  default: a\n").unwrap();
    let err = FontStore::load_from_injected(&pack, packs).unwrap_err();
    // The failure is the parse, not the (matching) hash — pins the order.
    assert!(
        !matches!(err, FontError::Sha256Mismatch(_)),
        "expected a parse failure, got {err:?}"
    );
}

#[test]
fn injected_no_faces_is_no_fonts() {
    let manifest = "version: 1\nlicense: X\nfaces: []\n".to_string();
    let packs = injected("p", manifest, &[]);
    let pack = LangPack::from_yaml_str("id: xx\nfonts:\n  uses: [p]\n  default: a\n").unwrap();
    let err = FontStore::load_from_injected(&pack, packs).unwrap_err();
    assert!(matches!(err, FontError::NoFonts(_)));
}

#[test]
fn injected_without_font_policy_is_no_fonts() {
    // A locale that declares no `fonts:` block has no default face.
    let pack = LangPack::from_yaml_str("id: xx\n").unwrap();
    let err = FontStore::load_from_injected(&pack, vec![]).unwrap_err();
    assert!(matches!(err, FontError::NoFonts(_)));
}

// --- Subset loading (the browser-preview lenient path) ---

/// One injected pack declaring a single face `face_id` backed by real,
/// fsType-passing `bytes` with a matching sha256.
fn one_pack(pack_id: &str, face_id: &str, bytes: Vec<u8>) -> InjectedPack {
    let manifest = format!(
        "version: 1\nlicense: X\nfaces:\n  - id: {face_id}\n    file: {face_id}.ttf\n    sha256: {}\n",
        sha_hex(&bytes),
    );
    let mut files = BTreeMap::new();
    files.insert(format!("{face_id}.ttf"), bytes);
    InjectedPack {
        id: pack_id.to_string(),
        manifest,
        files,
    }
}

/// A two-pack locale: default face `a` lives in pack `p`, fallback face `b`
/// in pack `q` — so dropping `q` drops the fallback but keeps the primary.
fn two_pack_locale() -> LangPack {
    LangPack::from_yaml_str("id: xx\nfonts:\n  uses: [p, q]\n  default: a\n  fallback: [b]\n")
        .unwrap()
}

#[test]
fn subset_skips_the_absent_fallback_pack_and_reports_it() {
    // Only the primary pack `p` injected: the store builds, `q` is reported
    // missing, and the fallback chain degrades to just the primary (which is
    // what makes an uncovered glyph surface as `missing_glyph`).
    let a = face_bytes("biz-udp-gothic");
    let (store, missing) =
        FontStore::load_from_injected_subset(&two_pack_locale(), vec![one_pack("p", "a", a)])
            .unwrap();
    assert_eq!(store.default_id(), "a");
    assert_eq!(missing, vec!["q".to_string()]);
    let chain = store.resolve_chain(Some("a"), FontWeight::Normal, FontStyle::Normal);
    assert!(chain.fallback_ids.is_empty());
}

#[test]
fn subset_with_every_pack_present_matches_the_strict_store() {
    let a = face_bytes("biz-udp-gothic");
    let b = face_bytes("noto-sans-mono");
    let packs = || vec![one_pack("p", "a", a.clone()), one_pack("q", "b", b.clone())];
    let (subset, missing) =
        FontStore::load_from_injected_subset(&two_pack_locale(), packs()).unwrap();
    let strict = FontStore::load_from_injected(&two_pack_locale(), packs()).unwrap();
    assert!(missing.is_empty());
    assert_eq!(subset.default_id(), strict.default_id());
    assert_eq!(subset.face_ids(), strict.face_ids());
    // The fallback chain is carried through the subset path too.
    let chain = subset.resolve_chain(Some("a"), FontWeight::Normal, FontStyle::Normal);
    assert_eq!(chain.fallback_ids, vec!["b".to_string()]);
}

#[test]
fn subset_missing_the_default_face_pack_is_unknown_face() {
    // The primary (default-face) pack `p` is absent; only the fallback pack is
    // injected. A store needs its default face, so this fails loudly — pack
    // absence is tolerated only when the primary survives.
    let b = face_bytes("noto-sans-mono");
    let err = FontStore::load_from_injected_subset(&two_pack_locale(), vec![one_pack("q", "b", b)])
        .unwrap_err();
    assert!(matches!(err, FontError::UnknownFace(ref id) if id == "a"));
}

#[test]
fn subset_with_nothing_injected_is_no_fonts() {
    let err = FontStore::load_from_injected_subset(&two_pack_locale(), vec![]).unwrap_err();
    assert!(matches!(err, FontError::NoFonts(_)));
}
