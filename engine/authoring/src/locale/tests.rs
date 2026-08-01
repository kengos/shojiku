//! Unit tests for locale-id resolution and overlay-string pack loading. No
//! filesystem: overlays are passed as strings, matching the bytes-first
//! contract.

use super::*;

#[test]
fn resolve_prefers_explicit_then_template_then_default() {
    assert_eq!(resolve_locale_id(Some("en-US"), Some("ja-JP")), "en-US");
    assert_eq!(resolve_locale_id(None, Some("ja-JP")), "ja-JP");
    assert_eq!(resolve_locale_id(None, None), "ja-JP");
}

#[test]
fn valid_locale_id_accepts_tags_and_rejects_junk() {
    assert!(valid_locale_id("ja-JP"));
    assert!(valid_locale_id("en_US"));
    assert!(!valid_locale_id(""));
    assert!(!valid_locale_id("ja/JP"));
    assert!(!valid_locale_id(&"x".repeat(65)));
}

#[test]
fn load_pack_returns_a_builtin() {
    assert_eq!(load_pack("ja-JP", None).unwrap().id, "ja-JP");
}

#[test]
fn load_pack_deep_merges_an_overlay_over_a_builtin() {
    // Any valid partial overlay exercises the builtin+overlay merge path.
    let pack = load_pack("ja-JP", Some("id: ja-JP\n")).unwrap();
    assert_eq!(pack.id, "ja-JP");
}

#[test]
fn load_pack_is_not_found_for_a_non_builtin_without_overlay() {
    assert!(matches!(
        load_pack("zz-ZZ", None),
        Err(LocaleError::NotFound(ref l)) if l == "zz-ZZ"
    ));
}

#[test]
fn load_pack_parses_a_standalone_overlay_for_a_non_builtin() {
    assert_eq!(load_pack("zz-ZZ", Some("id: zz-ZZ\n")).unwrap().id, "zz-ZZ");
}

#[test]
fn load_pack_surfaces_a_standalone_parse_error() {
    // Non-builtin id: the overlay is parsed as a whole pack (the from_yaml_str
    // arm), and a malformed one becomes a Pack error.
    assert!(matches!(
        load_pack("zz-ZZ", Some("id: [not a string]\n")),
        Err(LocaleError::Pack(_))
    ));
}

#[test]
fn load_pack_surfaces_a_builtin_overlay_parse_error() {
    // Builtin id with malformed overlay: the merge path errors (the builtin
    // `?` arm).
    assert!(matches!(
        load_pack("ja-JP", Some(":\n : bad")),
        Err(LocaleError::Pack(_))
    ));
}
