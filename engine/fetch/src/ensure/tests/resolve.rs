//! Where each face's bytes come from: a shipped file, the cache, or the
//! network — and that the cheaper sources short-circuit the later ones.

use super::*;

#[test]
fn a_present_file_is_left_alone_and_never_fetched() {
    let root = temp_root("present");
    let local = root.join("sans.ttf");
    std::fs::write(&local, FONT).expect("write");
    let t = FakeTransport::default();

    let (out, report) = run(
        vec![spec(
            local.clone(),
            &sha_of(FONT),
            Some("https://github.com/s.ttf"),
        )],
        &root,
        &t,
        Mode::Online,
    )
    .expect("ensure");

    assert_eq!(out[0].path, local, "a shipped face must not be repointed");
    assert!(t.calls().is_empty(), "must not touch the network");
    assert!(report.fetched.is_empty());
}

#[test]
fn a_cache_hit_repoints_without_fetching() {
    let root = temp_root("cachehit");
    let sha = sha_of(FONT);
    let blob = FontCache::new(root.clone()).put(&sha, FONT).expect("seed");
    let t = FakeTransport::default();

    let (out, report) = run(
        vec![spec(
            root.join("absent.ttf"),
            &sha,
            Some("https://github.com/s.ttf"),
        )],
        &root,
        &t,
        Mode::Online,
    )
    .expect("ensure");

    assert_eq!(out[0].path, blob, "should load from the cache blob");
    assert!(t.calls().is_empty(), "warm cache must not fetch");
    assert!(report.fetched.is_empty());
}

#[test]
fn a_missing_face_is_fetched_verified_cached_and_repointed() {
    let root = temp_root("fetch");
    let sha = sha_of(FONT);
    let url = "https://github.com/s.ttf";
    let t = FakeTransport::with(vec![(url, Reply::Body(FONT.to_vec()))]);

    let (out, report) = run(
        vec![spec(root.join("absent.ttf"), &sha, Some(url))],
        &root,
        &t,
        Mode::Online,
    )
    .expect("ensure");

    assert_eq!(t.calls(), [url]);
    assert_eq!(std::fs::read(&out[0].path).unwrap(), FONT);
    assert_eq!(report.fetched, [("sans".to_string(), url.to_string())]);
    // The bytes landed in the cache, so a second run is offline-clean.
    assert!(FontCache::new(root).get(&sha).is_some());
}

#[test]
fn offline_refuses_to_fetch_and_says_so() {
    let root = temp_root("offline");
    let t = FakeTransport::with(vec![(
        "https://github.com/s.ttf",
        Reply::Body(FONT.to_vec()),
    )]);

    let err = run(
        vec![spec(
            root.join("absent.ttf"),
            &sha_of(FONT),
            Some("https://github.com/s.ttf"),
        )],
        &root,
        &t,
        Mode::Offline,
    )
    .unwrap_err();

    assert!(matches!(err, FetchError::Offline { .. }), "got: {err}");
    assert!(t.calls().is_empty(), "offline must not open a socket");
    // The message tells the user how to proceed.
    let msg = err.to_string();
    assert!(msg.contains("offline"), "got: {msg}");
    assert!(
        msg.contains("my-pack") && msg.contains("sans"),
        "got: {msg}"
    );
}

#[test]
fn offline_still_uses_a_warm_cache() {
    let root = temp_root("offlinewarm");
    let sha = sha_of(FONT);
    let blob = FontCache::new(root.clone()).put(&sha, FONT).expect("seed");
    let t = FakeTransport::default();

    let (out, _) = run(
        vec![spec(
            root.join("absent.ttf"),
            &sha,
            Some("https://github.com/s.ttf"),
        )],
        &root,
        &t,
        Mode::Offline,
    )
    .expect("warm cache works offline");

    assert_eq!(out[0].path, blob);
}

#[test]
fn a_missing_face_without_a_url_names_the_pack_and_face() {
    let root = temp_root("nourl");
    let err = run(
        vec![spec(root.join("absent.ttf"), &sha_of(FONT), None)],
        &root,
        &FakeTransport::default(),
        Mode::Online,
    )
    .unwrap_err();

    assert!(matches!(err, FetchError::MissingNoUrl { .. }), "got: {err}");
    let msg = err.to_string();
    assert!(msg.contains("my-pack"), "got: {msg}");
    assert!(msg.contains("sans"), "got: {msg}");
}

#[test]
fn a_transport_failure_is_a_hard_error_naming_the_face() {
    let root = temp_root("notfound");
    // The fake replies 404 for any URL it was not primed with.
    let url = "https://github.com/gone.ttf";
    let err = run(
        vec![spec(root.join("absent.ttf"), &sha_of(FONT), Some(url))],
        &root,
        &FakeTransport::default(),
        Mode::Online,
    )
    .unwrap_err();

    assert!(
        matches!(
            err,
            FetchError::Transport {
                source: TransportError::Status(404),
                ..
            }
        ),
        "got: {err}"
    );
    let msg = err.to_string();
    assert!(
        msg.contains("my-pack") && msg.contains("sans"),
        "got: {msg}"
    );
}

#[test]
fn every_face_in_the_list_is_ensured() {
    let root = temp_root("many");
    let other = b"second face".to_vec();
    let present = root.join("here.ttf");
    std::fs::write(&present, FONT).expect("write");
    let url = "https://github.com/second.ttf";
    let t = FakeTransport::with(vec![(url, Reply::Body(other.clone()))]);

    let (out, report) = run(
        vec![
            spec(present.clone(), &sha_of(FONT), None),
            spec(root.join("absent.ttf"), &sha_of(&other), Some(url)),
        ],
        &root,
        &t,
        Mode::Online,
    )
    .expect("ensure");

    assert_eq!(out.len(), 2);
    assert_eq!(out[0].path, present, "the present face stays put");
    assert_eq!(std::fs::read(&out[1].path).unwrap(), other);
    assert_eq!(report.fetched.len(), 1, "only the missing one was fetched");
}

#[test]
fn ensuring_an_empty_list_is_a_no_op() {
    let root = temp_root("empty");
    let (out, report) =
        run(vec![], &root, &FakeTransport::default(), Mode::Online).expect("ensure");
    assert!(out.is_empty());
    assert!(report.fetched.is_empty());
}
