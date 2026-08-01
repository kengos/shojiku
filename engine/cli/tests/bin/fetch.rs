//! The pinned-font host path: a pack that ships a manifest but NOT its face
//! files, resolved from the cache or refused.
//!
//! There is deliberately no test that fetches over the real network: the
//! allowlist admits https names only (never loopback IPs), which is exactly the
//! property under test elsewhere. The fetch mechanics are covered in
//! `shojiku-fetch` (a fake transport, plus the ureq transport over a loopback
//! listener); what matters HERE is the CLI's end of the contract — a pinned
//! pack renders from a warm cache, offline, byte-for-byte like a local one.

use super::*;
use std::path::Path;

/// Every pack the builtin en-US locale `uses:` — all of them must resolve, so
/// a fixture that pins only one still needs the others present.
const US_PACKS: &[&str] = &["noto-sans", "noto-sans-mono"];

fn us_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/business/receipt-us")
}

fn sha_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes)
        .iter()
        .fold(String::new(), |mut s, b| {
            use std::fmt::Write;
            let _ = write!(s, "{b:02x}");
            s
        })
}

/// The face `file:` names a pack's manifest declares.
fn faces_of(pack: &str) -> Vec<String> {
    std::fs::read_to_string(font_dir().join(pack).join("manifest.yml"))
        .expect("manifest")
        .lines()
        .filter_map(|l| l.trim().strip_prefix("file: ").map(str::to_string))
        .collect()
}

/// A font dir holding every en-US pack's `manifest.yml` and NO face files, each
/// face given a `url:` pin unless `with_url` says otherwise. This is the shape
/// a template exported from another machine has.
fn pinned_font_dir(tag: &str, with_url: bool) -> PathBuf {
    let dir = temp_path(&format!("{tag}-fonts"));
    let _ = std::fs::remove_dir_all(&dir);
    for pack in US_PACKS {
        let pack_dir = dir.join(pack);
        std::fs::create_dir_all(&pack_dir).expect("pack dir");
        let mut manifest =
            std::fs::read_to_string(font_dir().join(pack).join("manifest.yml")).expect("manifest");
        if with_url {
            for face in faces_of(pack) {
                manifest = manifest.replace(
                    &format!("file: {face}\n"),
                    &format!("file: {face}\n    url: https://github.com/notofonts/{face}\n"),
                );
            }
        }
        std::fs::write(pack_dir.join("manifest.yml"), manifest).expect("write manifest");
    }
    dir
}

/// Seeds the content-addressed cache with the real face bytes, as a previous
/// online run would have left it.
fn warm_cache(tag: &str) -> PathBuf {
    let root = temp_path(&format!("{tag}-cache"));
    let _ = std::fs::remove_dir_all(&root);
    let blobs = root.join("fonts");
    std::fs::create_dir_all(&blobs).expect("cache dir");
    for pack in US_PACKS {
        for face in faces_of(pack) {
            let bytes = std::fs::read(font_dir().join(pack).join(&face)).expect("face bytes");
            std::fs::write(blobs.join(sha_hex(&bytes)), &bytes).expect("seed blob");
        }
    }
    root
}

fn render_us(font_dir_arg: &Path, cache: Option<&Path>, extra: &[&str]) -> Output {
    let mut args = vec![
        "render".to_string(),
        "--templates".into(),
        path_arg(us_dir().join("templates.yml")),
        "--params".into(),
        path_arg(us_dir().join("params.json")),
        "--lang".into(),
        "en-US".into(),
        "--font-dir".into(),
        path_arg(font_dir_arg.to_path_buf()),
        "--locale-dir".into(),
        path_arg(locale_dir()),
        "--output".into(),
        "-".into(),
    ];
    args.extend(extra.iter().map(|s| (*s).to_string()));

    let mut cmd = Command::new(env!("CARGO_BIN_EXE_shojiku"));
    cmd.args(&args);
    match cache {
        Some(c) => cmd.env("SHOJIKU_CACHE_DIR", c),
        // Never let a developer's real cache leak into the cold-cache cases.
        None => cmd.env("SHOJIKU_CACHE_DIR", temp_path("nonexistent-cache")),
    };
    cmd.output().expect("spawn shojiku")
}

#[test]
fn a_warm_cache_renders_offline_byte_identically_to_local_fonts() {
    // The determinism promise: where the bytes CAME from cannot change the
    // document. An air-gapped machine with a warm cache must produce exactly
    // what the machine with the fonts installed produced.
    let local = render_us(&font_dir(), None, &[]);
    assert!(
        local.status.success(),
        "baseline: {}",
        String::from_utf8_lossy(&local.stderr)
    );

    let fonts = pinned_font_dir("warm", true);
    let cache = warm_cache("warm");
    let pinned = render_us(&fonts, Some(&cache), &["--offline"]);
    assert!(
        pinned.status.success(),
        "pinned+offline: {}",
        String::from_utf8_lossy(&pinned.stderr)
    );

    assert!(pinned.stdout.starts_with(b"%PDF-"));
    assert_eq!(
        pinned.stdout, local.stdout,
        "a cache-resolved font must render identical bytes to an installed one"
    );
    // Cache-only resolution must not be chatty about fetching.
    assert!(
        !String::from_utf8_lossy(&pinned.stderr).contains("fetched"),
        "stderr: {}",
        String::from_utf8_lossy(&pinned.stderr)
    );

    let _ = std::fs::remove_dir_all(fonts);
    let _ = std::fs::remove_dir_all(cache);
}

#[test]
fn offline_with_a_cold_cache_fails_with_an_actionable_message() {
    let fonts = pinned_font_dir("cold", true);
    let out = render_us(&fonts, None, &["--offline"]);

    assert!(!out.status.success(), "must not render without the bytes");
    let err = String::from_utf8_lossy(&out.stderr);
    // Names the pack, the face, and how to proceed — not a bare io error.
    assert!(err.contains("noto-sans"), "stderr: {err}");
    assert!(err.contains("offline"), "stderr: {err}");
    assert!(!out.stdout.starts_with(b"%PDF-"), "must emit no document");

    let _ = std::fs::remove_dir_all(fonts);
}

#[test]
fn a_pinned_face_off_the_allowlist_is_refused_before_any_request() {
    let dir = pinned_font_dir("policy", true);
    let manifest_path = dir.join("noto-sans/manifest.yml");
    let manifest = std::fs::read_to_string(&manifest_path)
        .expect("manifest")
        .replace("https://github.com/notofonts/", "https://evil.example/");
    std::fs::write(&manifest_path, manifest).expect("write");

    let out = render_us(&dir, None, &[]);

    assert!(!out.status.success());
    let err = String::from_utf8_lossy(&out.stderr);
    assert!(err.contains("evil.example"), "stderr: {err}");
    assert!(err.contains("--font-fetch-allow"), "stderr: {err}");

    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_missing_face_without_a_url_says_so_rather_than_mentioning_fetching() {
    // The stock manifests: pins, but no `url:` anywhere.
    let dir = pinned_font_dir("nourl", false);

    let out = render_us(&dir, None, &[]);

    assert!(!out.status.success());
    let err = String::from_utf8_lossy(&out.stderr);
    assert!(err.contains("no `url:`"), "stderr: {err}");

    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn shipped_packs_render_without_a_cache_dir_at_all() {
    // The common case must not depend on the fetch layer: point the cache at
    // an unusable location and render anyway.
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_shojiku"));
    cmd.args([
        "render",
        "--templates",
        &path_arg(us_dir().join("templates.yml")),
        "--params",
        &path_arg(us_dir().join("params.json")),
        "--lang",
        "en-US",
        "--font-dir",
        &path_arg(font_dir()),
        "--locale-dir",
        &path_arg(locale_dir()),
        "--output",
        "-",
        "--offline",
    ])
    .env_remove("SHOJIKU_CACHE_DIR")
    .env_remove("HOME")
    .env_remove("XDG_CACHE_HOME");
    let out = cmd.output().expect("spawn shojiku");

    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(out.stdout.starts_with(b"%PDF-"));
}
