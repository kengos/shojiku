//! The link-URL fuzz harness: accepted URLs pass every assertion, refused
//! ones return `false` before any assertion, and the rule assertion panics
//! on an accepted URL that breaks it.

use super::*;

#[test]
fn accepted_urls_satisfy_every_assertion() {
    for url in [
        "https://example.com/a",
        "  HTTP://example.com  ",
        "mailto:a@example.com",
        "TeL:+81-3-0000-0000",
    ] {
        assert!(link_url(url), "{url} was refused");
    }
}

#[test]
fn refused_urls_return_without_asserting() {
    let too_long = format!("https://example.com/{}", "a".repeat(MAX_LINK_URL));
    for url in [
        "",
        "javascript:alert(1)",
        "https://a\u{7}b",
        too_long.as_str(),
    ] {
        assert!(!link_url(url), "{url:?} was accepted");
    }
}

#[test]
#[should_panic(expected = "allowed scheme")]
fn an_accepted_url_without_an_allowed_scheme_panics() {
    assert_link_rule("ftp://example.com", "ftp://example.com");
}
