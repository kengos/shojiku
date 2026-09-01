//! The reference URI grammar, at its edges.
//!
//! The point of these cases is where a hostile string is REFUSED: at the
//! grammar, before any lookup. A string that survives `parse` names a stem
//! and at most one selector, both drawn from a closed ASCII charset — so a
//! traversal attempt cannot become a not-found, let alone a read.

use super::*;

#[test]
fn a_bare_page_parses_to_its_stem() {
    assert_eq!(
        parse("shojiku://reference/box"),
        Some(Ref {
            stem: "box",
            fragment: None
        })
    );
    // Stems really do carry `_`, `-` and `.`.
    for stem in ["char_grid", "data-binding", "page_number", "README"] {
        assert_eq!(
            parse(&page_uri(stem)),
            Some(Ref {
                stem,
                fragment: None
            })
        );
    }
}

#[test]
fn a_fragment_parses_beside_its_stem() {
    assert_eq!(
        parse("shojiku://reference/box#margin"),
        Some(Ref {
            stem: "box",
            fragment: Some("margin")
        })
    );
    assert_eq!(
        parse("shojiku://reference/table#Column.style"),
        Some(Ref {
            stem: "table",
            fragment: Some("Column.style")
        })
    );
}

#[test]
fn the_formatters_round_trip_through_the_parser() {
    assert_eq!(page_uri("box"), "shojiku://reference/box");
    assert_eq!(
        fragment_uri("box", "margin"),
        "shojiku://reference/box#margin"
    );
    assert_eq!(
        parse(&fragment_uri("table", "Column.style")).expect("round trip"),
        Ref {
            stem: "table",
            fragment: Some("Column.style")
        }
    );
}

#[test]
fn a_string_outside_the_family_is_not_ours() {
    for other in [
        "shojiku://example/business/invoice-ja",
        "file:///etc/passwd",
        "https://example.com/evil",
        "shojiku://reference",
        "SHOJIKU://REFERENCE/box",
    ] {
        assert!(parse(other).is_none(), "{other} should not parse");
    }
}

#[test]
fn a_traversal_attempt_is_refused_at_the_grammar() {
    for hostile in [
        "shojiku://reference/../../etc/passwd",
        "shojiku://reference/..",
        "shojiku://reference/.",
        "shojiku://reference/%2e%2e%2f%2e%2e%2fetc/passwd",
        "shojiku://reference/box/../../Cargo.toml",
        "shojiku://reference/docs/engine/box",
        "shojiku://reference/box\0",
        "shojiku://reference/box\u{001b}[2J",
        "shojiku://reference/b x",
    ] {
        assert!(parse(hostile).is_none(), "{hostile} should be refused");
    }
}

#[test]
fn an_empty_half_is_refused_rather_than_guessed_at() {
    // Each of these is a shape the grammar does not define; none may panic
    // and none may resolve.
    for degenerate in [
        "shojiku://reference/",
        "shojiku://reference/#margin",
        "shojiku://reference/box#",
    ] {
        assert!(
            parse(degenerate).is_none(),
            "{degenerate} should be refused"
        );
    }
}

#[test]
fn a_second_hash_is_refused() {
    assert!(parse("shojiku://reference/box#a#b").is_none());
    assert!(parse("shojiku://reference/box##").is_none());
}

#[test]
fn a_hostile_fragment_is_refused_at_the_grammar() {
    for hostile in [
        "shojiku://reference/box#../../etc/passwd",
        "shojiku://reference/box#%2e%2e",
        "shojiku://reference/box#mar gin",
        "shojiku://reference/box#\u{202e}nigram",
        "shojiku://reference/box#mar\0gin",
        "shojiku://reference/box#mar\u{001b}gin",
    ] {
        assert!(parse(hostile).is_none(), "{hostile} should be refused");
    }
}

#[test]
fn the_fragment_is_length_bounded() {
    let at_cap = "m".repeat(MAX_FRAGMENT);
    assert_eq!(
        parse(&fragment_uri("box", &at_cap))
            .expect("at the cap")
            .fragment,
        Some(at_cap.as_str())
    );
    let over = "m".repeat(MAX_FRAGMENT + 1);
    assert!(parse(&fragment_uri("box", &over)).is_none(), "over the cap");
    // The bound is in CHARACTERS, so a multi-byte selector is not cut
    // short of the cap by its encoding — it is refused by the charset
    // first, which is the stricter of the two.
    assert!(parse(&fragment_uri("box", "マージン")).is_none());
}

#[test]
fn a_long_stem_is_accepted_by_the_grammar_and_simply_names_nothing() {
    // The stem carries no length cap: it is one segment of a closed
    // charset, and an over-long one is a not-found rather than a
    // malformed URI. The ECHO is what has to stay bounded, and that is
    // `clip`'s job (asserted in the resources tests).
    let long = "a".repeat(600);
    assert_eq!(
        parse(&page_uri(&long)).expect("well formed").stem,
        long.as_str()
    );
}

#[test]
fn the_two_uri_families_draw_from_one_charset() {
    // The predicate is maintained in two copies — `is_accepted` here and
    // the closure in `examples::uri::segment` — and `docs/code-map/hosts.md`
    // states they are the same closed charset. Nothing else holds them
    // equal, so this does: widening one side alone fails here.
    //
    // `#` is compared out, and it is the only exclusion: both charsets
    // reject it, but it is the reference family's fragment DELIMITER, so
    // the two grammars part company on it by design rather than by charset.
    for code in (0..0x300).chain([0x202E, 0x3000, 0xFF20, 0x1F600]) {
        let Some(c) = char::from_u32(code) else {
            continue;
        };
        if c == '#' {
            continue;
        }
        // Each probe puts the codepoint INSIDE a segment that is otherwise
        // well formed, so what differs can only be the charset. The example
        // side uses the deepest form, where a `/` overflows the grammar
        // exactly as it fails the reference stem's single segment.
        let reference = parse(&format!("shojiku://reference/pa{c}ge")).is_some();
        let example =
            crate::examples::uri::parse(&format!("shojiku://example/bucket/name/fi{c}le"))
                .is_some();
        assert_eq!(reference, example, "U+{code:04X} splits the two charsets");
    }
    // Positive control: the loop reached the accepting cases too, not only
    // rejections.
    assert!(parse("shojiku://reference/pa-ge").is_some());
    assert!(crate::examples::uri::parse("shojiku://example/bucket/name/fi-le").is_some());
}
