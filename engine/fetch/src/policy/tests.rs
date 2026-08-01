//! Unit tests for the fetch allowlist — the hostile cases are the point.

use super::*;

fn policy() -> FetchPolicy {
    FetchPolicy::default()
}

#[test]
fn allowlisted_host_and_its_subdomains_pass() {
    assert!(policy().check("https://github.com/a/b.ttf").is_ok());
    assert!(policy()
        .check("https://objects.githubusercontent.com/x.ttf")
        .is_ok());
    // A subdomain of an allowlisted host.
    assert!(policy().check("https://cdn.github.com/x.ttf").is_ok());
}

#[test]
fn suffix_match_respects_the_dot_boundary() {
    // The classic bypass: an attacker-registered domain that merely ENDS with
    // the allowlisted string, and one that merely CONTAINS it.
    for url in [
        "https://evil-fonts.gstatic.com.attacker.io/x.ttf",
        "https://notgithub.com/x.ttf",
        "https://github.com.evil.io/x.ttf",
        "https://fonts.gstatic.com.evil.io/x.ttf",
    ] {
        let err = policy().check(url).unwrap_err();
        assert!(err.contains("not in the allowlist"), "{url} -> {err}");
    }
}

#[test]
fn non_https_schemes_are_rejected() {
    for (url, needle) in [
        ("http://github.com/x.ttf", "not https"),
        ("ftp://github.com/x.ttf", "not https"),
    ] {
        let err = policy().check(url).unwrap_err();
        assert!(err.contains(needle), "{url} -> {err}");
    }
}

#[test]
fn non_network_urls_are_rejected() {
    // These never reach the scheme check — the URI parser rejects an
    // authority-less form outright. What matters is that none is accepted.
    for url in [
        "file:///etc/passwd",
        "data:font/ttf;base64,AAAA",
        "not a url at all",
        "",
    ] {
        assert!(policy().check(url).is_err(), "accepted {url:?}");
    }
}

#[test]
fn scheme_relative_url_has_no_scheme() {
    let err = policy().check("//github.com/x.ttf").unwrap_err();
    assert!(err.contains("no scheme"), "got: {err}");
}

#[test]
fn userinfo_urls_are_rejected() {
    // `Uri::host` would report `github.com` here while the real connection
    // target is decided by the authority — reject the ambiguity.
    let err = policy()
        .check("https://github.com@evil.io/x.ttf")
        .unwrap_err();
    assert!(err.contains("userinfo"), "got: {err}");
}

#[test]
fn ip_literal_hosts_are_rejected() {
    let v4 = policy().check("https://127.0.0.1/x.ttf").unwrap_err();
    assert!(v4.contains("IP literal"), "got: {v4}");
    let v6 = policy().check("https://[::1]/x.ttf").unwrap_err();
    assert!(v6.contains("IP literal"), "got: {v6}");
    // Even one the user allowlisted stays rejected: names only.
    let allowed = FetchPolicy::with_extra_hosts(&["127.0.0.1"]);
    assert!(allowed.check("https://127.0.0.1/x.ttf").is_err());
}

#[test]
fn extra_hosts_are_additive_and_case_insensitive() {
    let p = FetchPolicy::with_extra_hosts(&["Fonts.Internal.Example"]);
    assert!(p.check("https://fonts.internal.example/x.ttf").is_ok());
    assert!(p.check("https://FONTS.INTERNAL.EXAMPLE/x.ttf").is_ok());
    // The defaults still apply alongside it.
    assert!(p.check("https://github.com/x.ttf").is_ok());
    assert!(p.check("https://elsewhere.example/x.ttf").is_err());
}

#[test]
fn host_matching_is_case_insensitive_for_defaults() {
    assert!(policy().check("https://GitHub.COM/x.ttf").is_ok());
}

#[test]
fn default_allowlist_is_the_documented_set() {
    // Pins the user-facing default: widening it is a deliberate decision.
    assert_eq!(
        DEFAULT_ALLOWED_HOSTS,
        [
            "fonts.gstatic.com",
            "github.com",
            "objects.githubusercontent.com",
            "raw.githubusercontent.com",
        ]
    );
}
