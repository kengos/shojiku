//! Subset font loading (the browser-preview lazy-fetch path): a partial pack
//! set loads with the absent packs reported, the strict load still requires
//! the full set, and the fetch → re-inject → reload loop clears the
//! `missing_glyph` a not-yet-fetched fallback pack caused.

use super::*;

/// A ja-JP template whose only text is U+20BB7 (𠮷) — a kanji the primary
/// biz-ud pack lacks but the ipamj-mincho fallback carries, so it renders as
/// `missing_glyph` until that fallback pack is fetched.
const RARE_KANJI: &str = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 100 }
    items:
      - type: text
        text: "𠮷"
"#;

#[test]
fn subset_load_requires_a_locale() {
    assert!(matches!(
        Session::new().load_fonts_subset(),
        Err(WasmError::LocaleNotSet)
    ));
}

#[test]
fn subset_load_reports_absent_packs_and_consumes_injected() {
    let mut session = Session::new();
    session.set_locale("ja-JP", None).unwrap();
    // Only the primary pack injected: the store builds, the fallback + mono
    // packs are reported missing, and the injected packs are consumed.
    inject_pack(&mut session, "biz-ud");
    let missing = session.load_fonts_subset().unwrap();
    assert!(session.fonts.is_some());
    assert!(session.font_packs.is_empty());
    assert!(missing.iter().any(|m| m == "ipamj-mincho"));
    assert!(missing.iter().any(|m| m == "noto-sans-mono"));
}

#[test]
fn subset_load_still_rejects_a_broken_injected_manifest() {
    // Leniency is absence-only: a garbage manifest in an INJECTED pack still
    // fails the subset load (a Fonts error, never a panic), exactly like the
    // strict path — integrity is unchanged.
    let mut session = Session::new();
    session.set_locale("ja-JP", None).unwrap();
    session.add_font_pack("biz-ud".into(), "not: [a: valid manifest".into());
    assert!(matches!(
        session.load_fonts_subset(),
        Err(WasmError::Fonts(_))
    ));
}

#[test]
fn strict_load_still_errors_when_a_pack_is_absent() {
    // The render/export path is unchanged: strict `load_fonts` with an absent
    // `uses` pack still fails loudly (the subset path is opt-in).
    let mut session = Session::new();
    session.set_locale("ja-JP", None).unwrap();
    inject_pack(&mut session, "biz-ud");
    assert!(matches!(session.load_fonts(), Err(WasmError::Fonts(_))));
}

#[test]
fn reload_after_fetching_the_fallback_clears_missing_glyph() {
    let mut session = Session::new();
    session.set_locale("ja-JP", None).unwrap();

    // First paint: only the primary pack fetched. The rare kanji lives in the
    // not-yet-fetched ipamj fallback → a `missing_glyph` diagnostic.
    inject_pack(&mut session, "biz-ud");
    let missing = session.load_fonts_subset().unwrap();
    assert!(missing.iter().any(|m| m == "ipamj-mincho"));
    let out = session
        .render(PageFormat::Png, RARE_KANJI, "{}", None, 2.0, None)
        .unwrap();
    assert!(out
        .diagnostics
        .items
        .iter()
        .any(|d| d.code == "missing_glyph"));

    // The host fetches the missing packs, re-injects the FULL set (it holds
    // the bytes JS-side), and reloads: nothing missing, glyph now covered.
    for id in ["biz-ud", "ipamj-mincho", "noto-sans-mono"] {
        inject_pack(&mut session, id);
    }
    let missing = session.load_fonts_subset().unwrap();
    assert!(missing.is_empty());
    let out = session
        .render(PageFormat::Png, RARE_KANJI, "{}", None, 2.0, None)
        .unwrap();
    assert!(!out
        .diagnostics
        .items
        .iter()
        .any(|d| d.code == "missing_glyph"));
}
