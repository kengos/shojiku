//! What a hostile manifest or a compromised/misbehaving server cannot make
//! the host do: use unpinned bytes, reach an untrusted host, escape the
//! cache directory, loop forever, or smuggle escapes onto the terminal.

use super::*;
use shojiku_diagnostics::Echo;

#[test]
fn wrong_bytes_fail_loudly_and_are_never_cached() {
    let root = temp_root("shamismatch");
    let url = "https://github.com/s.ttf";
    // The server returns something other than what the manifest pins.
    let t = FakeTransport::with(vec![(url, Reply::Body(b"evil font".to_vec()))]);
    let pinned = sha_of(FONT);

    let err = run(
        vec![spec(root.join("absent.ttf"), &pinned, Some(url))],
        &root,
        &t,
        Mode::Online,
    )
    .unwrap_err();

    assert!(
        matches!(err, FetchError::Sha256Mismatch { ref expected, .. } if expected.as_str() == pinned),
        "got: {err}"
    );
    // Nothing unverified may reach the cache.
    assert!(FontCache::new(root.clone()).get(&pinned).is_none());
    assert!(FontCache::new(root).get(&sha_of(b"evil font")).is_none());
}

#[test]
fn an_off_allowlist_url_is_refused_before_any_request() {
    let root = temp_root("policy");
    let t = FakeTransport::default();
    let err = run(
        vec![spec(
            root.join("absent.ttf"),
            &sha_of(FONT),
            Some("https://evil.example/s.ttf"),
        )],
        &root,
        &t,
        Mode::Online,
    )
    .unwrap_err();

    assert!(matches!(err, FetchError::Policy { .. }), "got: {err}");
    assert!(t.calls().is_empty(), "policy must gate BEFORE the request");
    assert!(err.to_string().contains("--font-fetch-allow"), "actionable");
}

#[test]
fn a_malformed_sha256_never_reaches_the_cache_or_network() {
    let root = temp_root("badsha");
    let t = FakeTransport::default();
    let err = run(
        vec![spec(
            root.join("absent.ttf"),
            "../../etc/passwd",
            Some("https://github.com/s.ttf"),
        )],
        &root,
        &t,
        Mode::Online,
    )
    .unwrap_err();

    assert!(matches!(err, FetchError::BadSha256 { .. }), "got: {err}");
    assert!(t.calls().is_empty());
}

#[test]
fn redirects_are_followed_and_each_hop_is_policy_checked() {
    let root = temp_root("redirect");
    let start = "https://github.com/s.ttf";
    let hop = "https://objects.githubusercontent.com/blob";
    let t = FakeTransport::with(vec![
        (start, Reply::Redirect(hop.to_string())),
        (hop, Reply::Body(FONT.to_vec())),
    ]);

    let (out, _) = run(
        vec![spec(root.join("absent.ttf"), &sha_of(FONT), Some(start))],
        &root,
        &t,
        Mode::Online,
    )
    .expect("ensure");

    assert_eq!(t.calls(), [start, hop], "both hops requested, in order");
    assert_eq!(std::fs::read(&out[0].path).unwrap(), FONT);
}

#[test]
fn a_redirect_off_the_allowlist_is_refused() {
    let root = temp_root("redirectevil");
    let start = "https://github.com/s.ttf";
    // An allowlisted host tries to bounce us somewhere untrusted.
    let t = FakeTransport::with(vec![(
        start,
        Reply::Redirect("https://evil.example/s.ttf".into()),
    )]);

    let err = run(
        vec![spec(root.join("absent.ttf"), &sha_of(FONT), Some(start))],
        &root,
        &t,
        Mode::Online,
    )
    .unwrap_err();

    assert!(
        matches!(err, FetchError::Policy { ref url, .. } if url.contains("evil.example")),
        "got: {err}"
    );
    assert_eq!(t.calls(), [start], "the evil hop must never be requested");
}

#[test]
fn a_redirect_to_plain_http_is_refused() {
    let root = temp_root("redirecthttp");
    let start = "https://github.com/s.ttf";
    let t = FakeTransport::with(vec![(
        start,
        Reply::Redirect("http://github.com/s.ttf".into()),
    )]);

    let err = run(
        vec![spec(root.join("absent.ttf"), &sha_of(FONT), Some(start))],
        &root,
        &t,
        Mode::Online,
    )
    .unwrap_err();

    assert!(
        matches!(err, FetchError::Policy { ref reason, .. } if reason.contains("not https")),
        "got: {err}"
    );
}

#[test]
fn a_root_relative_redirect_resolves_against_its_origin() {
    let root = temp_root("relredirect");
    let start = "https://github.com/a/s.ttf";
    let t = FakeTransport::with(vec![
        (start, Reply::Redirect("/blob/s.ttf".into())),
        ("https://github.com/blob/s.ttf", Reply::Body(FONT.to_vec())),
    ]);

    let (out, _) = run(
        vec![spec(root.join("absent.ttf"), &sha_of(FONT), Some(start))],
        &root,
        &t,
        Mode::Online,
    )
    .expect("ensure");

    assert_eq!(t.calls(), [start, "https://github.com/blob/s.ttf"]);
    assert_eq!(std::fs::read(&out[0].path).unwrap(), FONT);
}

#[test]
fn a_path_relative_redirect_is_not_guessed_at() {
    // Neither absolute nor root-relative. Rather than invent base-path
    // semantics, it is passed through as-is and the policy rejects it — the
    // safe direction: no request goes out.
    let root = temp_root("weirdredirect");
    let start = "https://github.com/a/s.ttf";
    let t = FakeTransport::with(vec![(start, Reply::Redirect("sibling.ttf".into()))]);

    let err = run(
        vec![spec(root.join("absent.ttf"), &sha_of(FONT), Some(start))],
        &root,
        &t,
        Mode::Online,
    )
    .unwrap_err();

    assert!(
        matches!(err, FetchError::Policy { ref url, .. } if url == "sibling.ttf"),
        "got: {err}"
    );
    assert_eq!(t.calls(), [start], "no second request may go out");
}

#[test]
fn a_redirect_loop_is_bounded() {
    let root = temp_root("loop");
    let a = "https://github.com/a";
    let b = "https://github.com/b";
    let t = FakeTransport::with(vec![
        (a, Reply::Redirect(b.to_string())),
        (b, Reply::Redirect(a.to_string())),
    ]);

    let err = run(
        vec![spec(root.join("absent.ttf"), &sha_of(FONT), Some(a))],
        &root,
        &t,
        Mode::Online,
    )
    .unwrap_err();

    assert!(
        matches!(
            err,
            FetchError::Transport {
                source: TransportError::TooManyRedirects(3),
                ..
            }
        ),
        "got: {err}"
    );
    assert_eq!(t.calls().len(), 4, "the initial hop plus the 3 allowed");
}

#[test]
fn a_hostile_url_is_stripped_and_clipped_in_the_error() {
    let root = temp_root("hostileurl");
    // Terminal escapes + an overlong URL: neither may reach stderr intact.
    let nasty = format!("https://evil.example/\u{1b}[31mred\u{7}{}", "A".repeat(400));
    let err = run(
        vec![spec(root.join("absent.ttf"), &sha_of(FONT), Some(&nasty))],
        &root,
        &FakeTransport::default(),
        Mode::Online,
    )
    .unwrap_err();

    let msg = err.to_string();
    assert!(!msg.contains('\u{1b}'), "escape survived: {msg:?}");
    assert!(!msg.contains('\u{7}'), "bell survived: {msg:?}");
    assert!(msg.contains('…'), "not clipped: {msg}");
    assert!(msg.len() < 400, "unbounded echo: {}", msg.len());
}

#[test]
fn every_fetch_error_field_is_bounded_not_just_the_url() {
    // The residual this cycle closes on the fetch path: `clip()` was applied
    // at seven call sites and only ever to the URL, so a manifest's pack id,
    // face id, file path and sha256 rode out raw. The bound is now the field
    // type, which no new variant can skip.
    let hostile = format!("\u{1b}[2J\u{7}{}", "z".repeat(10_000));
    let errors = [
        FetchError::MissingNoUrl {
            pack: Echo::from(&hostile),
            id: Echo::from(&hostile),
            path: Echo::from(&hostile),
        },
        FetchError::BadSha256 {
            pack: Echo::from(&hostile),
            id: Echo::from(&hostile),
            sha256: Echo::from(&hostile),
        },
        FetchError::Sha256Mismatch {
            pack: Echo::from(&hostile),
            id: Echo::from(&hostile),
            url: Echo::from(&hostile),
            expected: Echo::from(&hostile),
            actual: Echo::from(&hostile),
        },
        FetchError::Policy {
            pack: Echo::from(&hostile),
            id: Echo::from(&hostile),
            url: Echo::from(&hostile),
            reason: Echo::from(&hostile),
        },
    ];
    for err in errors {
        let message = err.to_string();
        assert!(
            !message.chars().any(char::is_control),
            "control character survived: {message:?}"
        );
        assert!(
            message.chars().count() < 5 * (shojiku_diagnostics::MAX_ECHO + 1) + 300,
            "unbounded fetch error ({} chars)",
            message.chars().count()
        );
    }
}
