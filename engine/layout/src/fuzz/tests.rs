//! The link-URL fuzz harness: accepted URLs pass every assertion and set
//! `accepted`, each refusal sets only its matching `refused_*` field and runs no
//! rule assertion, and the rule assertion panics on an accepted URL that
//! breaks it.

use super::*;

#[test]
fn accepted_urls_satisfy_every_assertion() {
    for url in [
        "https://example.com/a",
        "  HTTP://example.com  ",
        "mailto:a@example.com",
        "TeL:+81-3-0000-0000",
        "http://xn--fsq.jp/%E9%81%93",
    ] {
        assert_eq!(
            link_url(url),
            LinkPaths {
                accepted: true,
                ..LinkPaths::default()
            },
            "{url} was refused"
        );
    }
}

#[test]
fn each_refusal_sets_only_its_refused_field() {
    let too_long = format!("https://example.com/{}", "a".repeat(MAX_LINK_URL));
    assert_eq!(
        link_url(""),
        LinkPaths {
            refused_empty: true,
            ..LinkPaths::default()
        }
    );
    assert_eq!(
        link_url(&too_long),
        LinkPaths {
            refused_too_long: true,
            ..LinkPaths::default()
        }
    );
    assert_eq!(
        link_url("https://a\u{7}b"),
        LinkPaths {
            refused_control: true,
            ..LinkPaths::default()
        }
    );
    assert_eq!(
        link_url("javascript:alert(1)"),
        LinkPaths {
            refused_scheme: true,
            ..LinkPaths::default()
        }
    );
    assert_eq!(
        link_url("https://example.com/\u{202E}"),
        LinkPaths {
            refused_not_ascii: true,
            ..LinkPaths::default()
        }
    );
}

#[test]
#[should_panic(expected = "allowed scheme")]
fn an_accepted_url_without_an_allowed_scheme_panics() {
    assert_link_rule("ftp://example.com", "ftp://example.com");
}

#[test]
#[should_panic(expected = "non-ASCII character")]
fn an_accepted_url_with_a_non_ascii_character_panics() {
    assert_link_rule("https://例.jp", "https://例.jp");
}

#[test]
#[should_panic(expected = "control byte")]
fn an_accepted_url_with_a_control_character_panics() {
    assert_link_rule("https://a\u{7}b", "https://a\u{7}b");
}
