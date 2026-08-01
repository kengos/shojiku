//! Unit tests for the content-addressed blob cache.

use super::*;

/// A temp dir unique per TEST (not just per process): parallel tests writing
/// the same blob name would otherwise race on one directory.
fn temp_root(tag: &str) -> PathBuf {
    let dir =
        std::env::temp_dir().join(format!("shojiku-fetch-cache-{}-{tag}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("temp dir");
    dir
}

fn sha_of(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

#[test]
fn put_then_get_round_trips_and_leaves_no_temp_files() {
    let root = temp_root("roundtrip");
    let cache = FontCache::new(root.clone());
    let bytes = b"font bytes".to_vec();
    let sha = sha_of(&bytes);

    assert!(cache.get(&sha).is_none(), "cold cache must miss");
    let path = cache.put(&sha, &bytes).expect("put");
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
    assert_eq!(cache.get(&sha), Some(path));

    // The atomic write must not leave its temp file behind.
    let leftovers: Vec<_> = std::fs::read_dir(root.join("fonts"))
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().contains(".tmp"))
        .collect();
    assert!(leftovers.is_empty(), "temp file leaked: {leftovers:?}");
}

#[test]
fn blob_is_named_by_its_digest() {
    let cache = FontCache::new(PathBuf::from("/c"));
    let sha = "a".repeat(64);
    assert_eq!(
        cache.blob_path(&sha),
        Some(PathBuf::from("/c/fonts").join(&sha))
    );
}

#[test]
fn a_malformed_digest_never_becomes_a_path() {
    let cache = FontCache::new(PathBuf::from("/c"));
    for bad in ["../../etc/passwd", "", "xyz", &"A".repeat(64), "a/b"] {
        assert_eq!(cache.blob_path(bad), None, "accepted {bad:?}");
        assert_eq!(cache.get(bad), None, "get accepted {bad:?}");
    }
}

#[test]
fn put_rejects_a_malformed_digest() {
    let cache = FontCache::new(temp_root("badput"));
    let err = cache.put("../../evil", b"x").unwrap_err();
    assert!(
        matches!(err, FetchError::Cache { action, .. } if action.contains("cache path")),
        "got: {err}"
    );
}

#[test]
fn a_corrupt_blob_is_a_miss_and_is_removed() {
    let root = temp_root("corrupt");
    let cache = FontCache::new(root.clone());
    let bytes = b"real font".to_vec();
    let sha = sha_of(&bytes);
    let path = cache.put(&sha, &bytes).expect("put");

    // Tamper with the cached blob: its name no longer describes its content.
    std::fs::write(&path, b"tampered").expect("tamper");
    assert_eq!(cache.get(&sha), None, "corrupt blob must miss");
    assert!(
        !path.exists(),
        "corrupt blob must be deleted, so it refetches"
    );

    // And the cache heals: a fresh put works.
    cache.put(&sha, &bytes).expect("re-put");
    assert!(cache.get(&sha).is_some());
}

#[test]
fn a_failed_commit_reports_and_leaves_no_temp_file() {
    // A directory squatting on the blob path: the rename cannot replace it.
    let root = temp_root("commitfail");
    let cache = FontCache::new(root.clone());
    let sha = sha_of(b"x");
    let blocked = root.join("fonts").join(&sha);
    std::fs::create_dir_all(&blocked).expect("squat");
    std::fs::write(blocked.join("occupied"), b"busy").expect("occupy");

    let err = cache.put(&sha, b"x").unwrap_err();

    assert!(
        matches!(err, FetchError::Cache { action, .. } if action == "commit"),
        "got: {err}"
    );
    // The failed attempt must not leave its temp file lying around.
    let leftovers: Vec<_> = std::fs::read_dir(root.join("fonts"))
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().contains(".tmp"))
        .collect();
    assert!(leftovers.is_empty(), "temp file leaked: {leftovers:?}");
}

#[test]
fn put_reports_an_unwritable_root() {
    // A file where the cache dir should be: create_dir_all cannot proceed.
    let root = temp_root("unwritable");
    std::fs::write(root.join("fonts"), b"not a dir").expect("blocker");
    let err = FontCache::new(root).put(&"a".repeat(64), b"x").unwrap_err();
    assert!(matches!(err, FetchError::Cache { .. }), "got: {err}");
}

#[test]
fn discover_honors_the_env_override() {
    temp_envs(
        &[("SHOJIKU_CACHE_DIR", Some("/tmp/shojiku-explicit"))],
        || {
            assert_eq!(
                default_cache_root(),
                Some(PathBuf::from("/tmp/shojiku-explicit"))
            );
            assert!(FontCache::discover().is_ok());
        },
    );
}

#[test]
fn platform_default_is_used_when_unset() {
    temp_envs(
        &[("SHOJIKU_CACHE_DIR", None), ("HOME", Some("/home/u"))],
        || {
            let root = default_cache_root().expect("a home-based default");
            assert!(root.ends_with("shojiku"), "got: {root:?}");
        },
    );
}

#[cfg(not(any(target_os = "macos", windows)))]
#[test]
fn xdg_cache_home_wins_over_home_on_unix() {
    temp_envs(
        &[
            ("SHOJIKU_CACHE_DIR", None),
            ("XDG_CACHE_HOME", Some("/xdg")),
            ("HOME", Some("/home/u")),
        ],
        || {
            assert_eq!(default_cache_root(), Some(PathBuf::from("/xdg/shojiku")));
        },
    );
}

#[test]
fn no_cache_dir_when_the_platform_offers_nowhere() {
    // Neither an override nor any home/base variable.
    temp_envs(
        &[
            ("SHOJIKU_CACHE_DIR", None),
            ("HOME", None),
            ("XDG_CACHE_HOME", None),
            ("LOCALAPPDATA", None),
        ],
        || {
            assert_eq!(default_cache_root(), None);
            assert!(matches!(
                FontCache::discover().unwrap_err(),
                FetchError::NoCacheDir
            ));
        },
    );
}

#[test]
fn an_empty_env_var_counts_as_unset() {
    // An exported-but-blank override must not root the cache at "".
    temp_envs(
        &[
            ("SHOJIKU_CACHE_DIR", Some("")),
            ("XDG_CACHE_HOME", None),
            ("LOCALAPPDATA", Some("/home/u/AppData")),
            ("HOME", Some("/home/u")),
        ],
        || {
            let root = default_cache_root().expect("falls through to the default");
            assert!(root.starts_with("/home/u"), "got: {root:?}");
        },
    );
}

/// Sets/clears env vars for the closure, restoring them afterwards. Env is
/// process-global, so these tests are serialized by a shared lock — take every
/// variable a case needs in ONE call (this lock is not reentrant).
fn temp_envs<F: FnOnce()>(vars: &[(&str, Option<&str>)], f: F) {
    use std::sync::Mutex;
    static LOCK: Mutex<()> = Mutex::new(());
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let old: Vec<_> = vars
        .iter()
        .map(|(k, _)| (*k, std::env::var_os(k)))
        .collect();
    apply(vars);
    f();
    for (k, v) in old {
        match v {
            Some(v) => std::env::set_var(k, v),
            None => std::env::remove_var(k),
        }
    }
}

fn apply(vars: &[(&str, Option<&str>)]) {
    for (k, v) in vars {
        match v {
            Some(v) => std::env::set_var(k, v),
            None => std::env::remove_var(k),
        }
    }
}
