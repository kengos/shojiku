//! Unit tests for the URL gate: allowlist, case tricks, hostile values.

use super::{check_link_url, LinkReject, MAX_LINK_URL};

#[test]
fn allowed_schemes_pass_and_trim() {
    for url in [
        "https://example.com/a?b=c",
        "http://例.jp/道",
        "mailto:billing@example.com",
        "tel:+81-3-0000-0000",
    ] {
        assert_eq!(check_link_url(url), Ok(url), "{url}");
    }
    // Leading/trailing whitespace is trimmed, not a bypass vector.
    assert_eq!(
        check_link_url("  https://example.com "),
        Ok("https://example.com")
    );
}

#[test]
fn scheme_matching_ignores_ascii_case_both_ways() {
    assert_eq!(
        check_link_url("HTTPS://EXAMPLE.COM"),
        Ok("HTTPS://EXAMPLE.COM")
    );
    assert_eq!(
        check_link_url("JaVaScRiPt:alert(1)"),
        Err(LinkReject::Scheme)
    );
}

#[test]
fn disallowed_schemes_are_rejected() {
    for url in [
        "javascript:alert(1)",
        "file:///etc/passwd",
        "ftp://example.com",
        "//example.com/schemeless",
        "example.com/no-scheme",
        "httpsx://not-https.example",
    ] {
        assert_eq!(check_link_url(url), Err(LinkReject::Scheme), "{url}");
    }
}

#[test]
fn control_characters_are_rejected() {
    assert_eq!(
        check_link_url("https://example.com/\u{0}"),
        Err(LinkReject::Control)
    );
    // An *interior* newline is a control reject, not trimmed away.
    assert_eq!(
        check_link_url("https://exa\nmple.com"),
        Err(LinkReject::Control)
    );
}

#[test]
fn empty_and_oversized_urls_are_rejected() {
    assert_eq!(check_link_url(""), Err(LinkReject::Empty));
    assert_eq!(check_link_url("   \t "), Err(LinkReject::Empty));
    let long = format!("https://example.com/{}", "a".repeat(MAX_LINK_URL));
    assert_eq!(check_link_url(&long), Err(LinkReject::TooLong));
}
