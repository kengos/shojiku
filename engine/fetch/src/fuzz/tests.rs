//! The redirect-chain fuzz harness: the allowlist oracle it asserts with,
//! and proof that its transport assertion fires when a policy lets a
//! request through that the default allowlist would refuse.

use super::*;

#[test]
fn the_oracle_accepts_allowlisted_https_hosts_and_their_subdomains() {
    assert!(independently_allowed("https://fonts.gstatic.com/s/a.ttf"));
    assert!(independently_allowed("https://FONTS.GSTATIC.COM/a.ttf"));
    assert!(independently_allowed("https://cdn.github.com/a.ttf"));
}

#[test]
fn the_oracle_refuses_non_https_userinfo_ip_and_foreign_hosts() {
    for url in [
        "not a url",
        "http://github.com/a.ttf",
        "/relative/path",
        "https://user@github.com/a.ttf",
        "https://127.0.0.1/a.ttf",
        "https://[::1]/a.ttf",
        "https://evil.example/a.ttf",
        "https://evilgithub.com/a.ttf",
        "https://github.com.evil.example/a.ttf",
        "https://github.com./a.ttf",
    ] {
        assert!(!independently_allowed(url), "{url} was accepted");
        assert!(
            FetchPolicy::default().check(url).is_err(),
            "the policy accepted {url}"
        );
    }
}

#[test]
fn a_chain_on_allowlisted_hosts_follows_every_hop() {
    // Two hops, one absolute and one root-relative, then a body whose
    // digest does not match the pin: every request is allowlisted.
    let requests =
        redirect_chain("https://github.com/a.ttf\nhttps://objects.githubusercontent.com/b\n/c.ttf");
    assert_eq!(requests, 3);
}

#[test]
fn a_redirect_off_the_allowlist_sends_no_request_for_that_hop() {
    assert_eq!(
        redirect_chain("https://github.com/a.ttf\nhttps://evil.example/a.ttf"),
        1
    );
}

#[test]
fn a_declared_url_off_the_allowlist_sends_no_request() {
    assert_eq!(redirect_chain("https://evil.example/a.ttf"), 0);
}

#[test]
fn a_redirect_loop_stops_at_the_request_limit() {
    let hop = "https://github.com/a.ttf";
    assert_eq!(redirect_chain(&[hop; 8].join("\n")), MAX_REQUESTS);
}

#[test]
fn an_empty_input_requests_nothing() {
    assert_eq!(redirect_chain(""), 0);
}

#[test]
#[should_panic(expected = "outside the default allowlist")]
fn the_transport_assertion_fires_when_a_policy_admits_a_foreign_host() {
    // Negative control: a policy wider than the default lets the request
    // reach the transport, and the oracle must refuse it.
    run_chain(
        "https://evil.example/a.ttf",
        &FetchPolicy::with_extra_hosts(&["evil.example"]),
    );
}
