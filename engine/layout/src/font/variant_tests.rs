//! Unit tests for face-variant selection (`FontStore::resolve`):
//! exact and independent weight/style fallback, and the real-variant
//! flags that turn synthetic emboldening/skew off.

use shojiku_core::{FontStyle, FontWeight};
use shojiku_formatter::LangPack;

use super::{FontFace, FontStore};

/// The bundled `noto-sans` pack ships a real italic face, so en-US text
/// with `fontStyle: italic` selects it and drops synthetic skew — the
/// headline of the fonts-only-pack + Noto work. Loads the real pack
/// (exercising manifest resolution + sha256 verification end to end).
#[test]
fn noto_pack_selects_a_real_italic_face() {
    let pack =
        LangPack::from_yaml_str("id: en\nfonts:\n  uses: [noto-sans]\n  default: noto-sans\n")
            .expect("locale");
    let store = FontStore::load_from_pack(&pack, &[super::test_support::repo_font_dir()])
        .expect("load noto");
    let r = store.resolve(Some("noto-sans"), FontWeight::Normal, FontStyle::Italic);
    assert_eq!(r.face.id, "noto-sans-italic");
    assert!(r.real_italic && !r.real_bold);
}

/// Builds a face from the real BIZ UD gothic bytes tagged with variant
/// keys (glyphs are irrelevant here — only the selection is tested).
fn variant(id: &str, family: &str, weight: FontWeight, style: FontStyle) -> FontFace {
    let path = super::test_support::repo_font_dir().join("biz-ud/BIZUDPGothic-Regular.ttf");
    FontFace::load(id, &path)
        .expect("load BIZUDPGothic-Regular")
        .with_variant(family.to_string(), weight, style)
}

#[test]
fn resolve_picks_the_matching_variant_and_reports_it() {
    let store = FontStore::from_faces(
        vec![
            variant("sans-r", "sans", FontWeight::Normal, FontStyle::Normal),
            variant("sans-b", "sans", FontWeight::Bold, FontStyle::Normal),
            variant("sans-i", "sans", FontWeight::Normal, FontStyle::Italic),
        ],
        "sans-r",
    )
    .expect("store");
    let b = store.resolve(Some("sans"), FontWeight::Bold, FontStyle::Normal);
    assert_eq!(b.face.id, "sans-b");
    assert!(b.real_bold && !b.real_italic);
    let i = store.resolve(Some("sans"), FontWeight::Normal, FontStyle::Italic);
    assert_eq!(i.face.id, "sans-i");
    assert!(i.real_italic && !i.real_bold);
    let r = store.resolve(Some("sans"), FontWeight::Normal, FontStyle::Normal);
    assert_eq!(r.face.id, "sans-r");
    assert!(!r.real_bold && !r.real_italic);
    // Bold+italic with only a real bold face: keep the real bold, keep the
    // italic synthetic (weight axis wins the partial fallback).
    let bi = store.resolve(Some("sans"), FontWeight::Bold, FontStyle::Italic);
    assert_eq!(bi.face.id, "sans-b");
    assert!(bi.real_bold && !bi.real_italic);
}

#[test]
fn resolve_falls_back_to_regular_then_default_face() {
    let store = FontStore::from_faces(
        vec![
            variant("solo", "solo", FontWeight::Normal, FontStyle::Normal),
            variant("serif-r", "serif", FontWeight::Normal, FontStyle::Normal),
            variant("serif-i", "serif", FontWeight::Normal, FontStyle::Italic),
        ],
        "solo",
    )
    .expect("store");
    // Bold requested but the family has none: regular face, synthetic on.
    let b = store.resolve(Some("solo"), FontWeight::Bold, FontStyle::Normal);
    assert_eq!(b.face.id, "solo");
    assert!(!b.real_bold);
    // Bold+italic with only a real italic: keep the italic, synth the bold.
    let bi = store.resolve(Some("serif"), FontWeight::Bold, FontStyle::Italic);
    assert_eq!(bi.face.id, "serif-i");
    assert!(bi.real_italic && !bi.real_bold);
    // Bold+italic with neither variant → the family's regular.
    let none = store.resolve(Some("solo"), FontWeight::Bold, FontStyle::Italic);
    assert_eq!(none.face.id, "solo");
    assert!(!none.real_bold && !none.real_italic);
    // Unknown family → the default face's family; None → the default face.
    assert_eq!(
        store
            .resolve(Some("nope"), FontWeight::Bold, FontStyle::Normal)
            .face
            .id,
        "solo"
    );
    assert_eq!(
        store
            .resolve(None, FontWeight::Normal, FontStyle::Normal)
            .face
            .id,
        "solo"
    );
}
