//! Search-dir precedence, overlay lookup, and pack-loading failure modes.

use super::*;

#[test]
fn font_and_locale_search_lists_are_additive() {
    // Single test so the env-var mutation cannot race a parallel reader.
    let flag = PathBuf::from("/flag");
    std::env::set_var("SHOJIKU_FONT_DIR", "/env/fonts");
    std::env::set_var("SHOJIKU_LOCALE_DIR", "/env/locale");
    // Flag first (priority), then env, then the repo default.
    assert_eq!(
        resolve_font_dirs(std::slice::from_ref(&flag)),
        vec![
            flag,
            PathBuf::from("/env/fonts"),
            PathBuf::from("packs/fonts"),
        ]
    );
    assert_eq!(
        resolve_locale_dir(&[]),
        vec![PathBuf::from("/env/locale"), PathBuf::from("packs/locale")]
    );
    std::env::remove_var("SHOJIKU_FONT_DIR");
    std::env::remove_var("SHOJIKU_LOCALE_DIR");
    // No flag, no env → just the default.
    assert_eq!(resolve_font_dirs(&[]), vec![PathBuf::from("packs/fonts")]);
}

/// A temp locale dir holding one `<file_name>` with `content`. `tag`
/// keeps parallel tests that share a file name (ja-jp.yml) from racing on
/// one directory.
fn temp_locale_dir(tag: &str, file_name: &str, content: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "shojiku-authoring-fs-{}-{tag}-{file_name}",
        std::process::id()
    ));
    std::fs::create_dir_all(&dir).expect("create temp locale dir");
    std::fs::write(dir.join(file_name), content).expect("write temp locale");
    dir
}

#[test]
fn find_locale_file_picks_first_existing_else_none() {
    let dir = temp_locale_dir("find", "zz-zz.yml", "id: zz-ZZ\n");
    let f = find_locale_file("zz-ZZ", std::slice::from_ref(&dir));
    assert_eq!(f, Some(dir.join("zz-zz.yml")));
    assert_eq!(
        find_locale_file("zz-ZZ", &[PathBuf::from("/no/such")]),
        None
    );
}

#[test]
fn builtin_locale_needs_no_file() {
    // A bare language tag resolves to its unique builtin region.
    let pack = load_locale_pack("ja", &[PathBuf::from("/no/such")]).expect("builtin ja-JP");
    assert_eq!(pack.id, "ja-JP");
    assert!(!pack.eras.is_empty());
    let pack = load_locale_pack("en-US", &[]).expect("builtin en-US");
    assert_eq!(pack.currency_default.as_deref(), Some("USD"));
}

#[test]
fn locale_file_overlays_the_builtin_per_key() {
    let dir = temp_locale_dir(
        "overlay",
        "ja-jp.yml",
        "currency:\n  JPY:\n    symbol: \"円\"\n",
    );
    let pack = load_locale_pack("ja-JP", std::slice::from_ref(&dir)).expect("merged");
    // Overridden key wins; untouched builtin keys survive.
    assert_eq!(pack.currency.get("JPY").expect("JPY").symbol, "円");
    assert!(pack.date_formats.contains_key("wareki"));
}

#[test]
fn malformed_overlay_file_is_a_pack_error() {
    // A builtin id with a malformed overlay → the merge fails in the
    // locale layer, surfacing as a LangPack (Pack) error.
    let dir = temp_locale_dir("malformed", "ja-jp.yml", "currency: [not a map]\n");
    let err = load_locale_pack("ja-JP", std::slice::from_ref(&dir)).unwrap_err();
    assert!(matches!(err, FsPackError::Pack(_)));
}

#[test]
fn non_builtin_locale_loads_its_file_standalone() {
    let dir = temp_locale_dir(
        "standalone",
        "xx-xx.yml",
        "id: xx-XX\ncurrencyDefault: EUR\n",
    );
    let pack = load_locale_pack("xx-XX", std::slice::from_ref(&dir)).expect("standalone");
    assert_eq!(pack.id, "xx-XX");
    assert_eq!(pack.currency_default.as_deref(), Some("EUR"));
}

#[test]
fn unknown_locale_error_lists_builtins_and_dirs() {
    let err = load_locale_pack("fr-FR", &[PathBuf::from("/no/such")]).unwrap_err();
    let FsPackError::LocaleNotFound { ref locale, .. } = err else { panic!("expected not-found") };
    assert_eq!(locale, "fr-FR");
    let msg = err.to_string();
    assert!(msg.contains("ja-JP") && msg.contains("en-US"), "{msg}");
    assert!(msg.contains("/no/such"), "{msg}");
}

#[test]
fn locale_ids_with_hostile_characters_are_rejected() {
    let oversized = "a".repeat(65); // valid charset, over the id cap
    for bad in ["../etc", "ja/jp", "", "ja jp", oversized.as_str()] {
        let err = load_locale_pack(bad, &[]).unwrap_err();
        assert!(matches!(err, FsPackError::InvalidLocale(_)), "{bad}");
    }
    // The echo in the error is truncated for oversized ids.
    let long = "/".repeat(500);
    let err = load_locale_pack(&long, &[]).unwrap_err();
    assert!(err.to_string().len() < 200);

    // Length was never the whole risk: a hostile id can be SHORT and still
    // repaint the terminal that prints the rejection. Both guards now come
    // from the same place, so neither can be applied without the other.
    let escaping = format!("\u{1b}[2J\u{7}{}", "x".repeat(70));
    let err = load_locale_pack(&escaping, &[]).unwrap_err();
    let message = err.to_string();
    assert!(
        !message.chars().any(char::is_control),
        "control character survived into a locale-id rejection: {message:?}"
    );
}

#[test]
fn unreadable_overlay_file_is_an_io_error() {
    // Invalid UTF-8 bytes make `read_to_string` fail deterministically
    // (permission tricks don't hold when tests run as root in Docker).
    let dir = std::env::temp_dir().join(format!("shojiku-authoring-fs-io-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("create temp dir");
    std::fs::write(dir.join("qq-qq.yml"), [0xFF, 0xFE, 0x00]).expect("write bytes");
    let err = load_locale_pack("qq-QQ", std::slice::from_ref(&dir)).unwrap_err();
    assert!(matches!(err, FsPackError::Io { .. }), "{err}");
    assert!(err.to_string().contains("qq-qq.yml"));
}
