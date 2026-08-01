//! Unit tests for the font module (faces, store, measurement).

use shojiku_formatter::LangPack;
use shojiku_image::PathCmd;
use std::path::Path;

use super::test_support::ja_store;
use super::*;

#[test]
fn loads_the_ja_pack_faces() {
    let store = ja_store();
    // Default is BIZ UD Gothic proportional; the pack carries the UDP/UD
    // lineup (each with a real bold), IPAmj明朝 as the fallback-only
    // mincho for the rare-name tail, and Noto Sans Mono (+bold) as the
    // code/monospace face.
    assert_eq!(store.default_id(), "biz-udp-gothic");
    assert_eq!(store.face_ids().len(), 7);
    for id in [
        "biz-udp-gothic",
        "biz-udp-gothic-bold",
        "biz-ud-gothic",
        "biz-ud-gothic-bold",
        "ipamj-mincho",
        "noto-sans-mono",
        "noto-sans-mono-bold",
    ] {
        assert!(store.get(id).is_some(), "missing face {id}");
    }
}

#[test]
fn biz_ud_gothic_covers_ibm_extension_kanji() {
    // BIZ UD is the default, so it must map the common rare-name kanji
    // (NEC/IBM-selected: 髙/﨑/德) directly, not lean on the fallback;
    // assert it here so coverage is gated, not assumed. (The rarer
    // CJK Ext-B tail like 𠮷 is the ipamj-mincho fallback's job.)
    let store = ja_store();
    let biz = store.get("biz-udp-gothic").expect("biz-udp-gothic");
    for c in ['髙', '﨑', '德'] {
        assert!(biz.glyph_id(c).is_some(), "biz-udp-gothic lacks {c}");
    }
}

#[test]
fn measures_latin_and_cjk_text() {
    let store = ja_store();
    let face = store.face(None);
    let latin = face.text_width("Hello", 12.0, 0.0);
    assert!(latin > 0.0);
    // The default (biz-udp) has proportional kana, but CJK is still wider
    // than the same count of Latin glyphs.
    assert!(face.text_width("あいう", 12.0, 0.0) > latin);
    // The fixed-pitch face advances every full-width glyph by exactly 1em.
    let fixed = store
        .get("biz-ud-gothic")
        .unwrap()
        .text_width("あいう", 12.0, 0.0);
    assert!((fixed - 36.0).abs() < 0.001, "not 1em/char: {fixed}");
}

#[test]
fn ascent_is_positive_and_proportional() {
    let store = ja_store();
    let face = store.face(None);
    let a12 = face.ascent(12.0);
    let a24 = face.ascent(24.0);
    assert!(a12 > 0.0);
    assert!((a24 - a12 * 2.0).abs() < 0.001);
}

#[test]
fn unknown_face_falls_back_to_default() {
    let store = ja_store();
    assert_eq!(store.face(Some("nope")).id, "biz-udp-gothic");
    assert_eq!(store.resolve_id(Some("nope")), "biz-udp-gothic");
    assert_eq!(store.resolve_id(Some("ipamj-mincho")), "ipamj-mincho");
    assert_eq!(store.resolve_id(None), "biz-udp-gothic");
}

#[test]
fn glyph_id_maps_known_chars_only() {
    let store = ja_store();
    let face = store.face(None);
    let gid = face.glyph_id('あ').expect("CJK glyph");
    assert_ne!(gid, 0);
    assert!(face.glyph_id('\u{10FFFF}').is_none());
}

#[test]
fn missing_glyph_uses_fallback_advance() {
    let store = ja_store();
    let face = store.face(None);
    // U+10FFFF (last code point) has no glyph; fallback advance is 0.6em.
    assert!(face.char_advance('\u{10FFFF}', 10.0).is_none());
    // `advance` applies the fallback where `char_advance` returns None.
    assert!((face.advance('\u{10FFFF}', 10.0) - 6.0).abs() < 0.001);
    let w = face.text_width("\u{10FFFF}", 10.0, 0.0);
    assert!((w - 6.0).abs() < 0.001, "unexpected width {w}");
}

#[test]
fn positioned_glyphs_place_run_left_to_right() {
    let store = ja_store();
    let face = store.face(None);
    // Two full-width CJK chars then one unmapped char: ids resolve
    // (unmapped -> .notdef gid 0), x accumulates by each advance, and
    // byte ranges track the multi-byte source.
    let glyphs = face.positioned_glyphs("あい\u{10FFFF}", 10.0, 0.0);
    assert_eq!(glyphs.len(), 3);
    assert_ne!(glyphs[0].glyph_id, 0);
    assert_eq!(glyphs[2].glyph_id, 0);

    // First glyph sits at the run origin; each subsequent x is the
    // previous x + advance (so the run width == sum of advances).
    assert_eq!(glyphs[0].x, 0.0);
    assert!((glyphs[1].x - glyphs[0].advance).abs() < 1e-9);
    assert!((glyphs[2].x - (glyphs[0].advance + glyphs[1].advance)).abs() < 1e-9);
    // The unmapped glyph carries the 0.6em fallback advance.
    assert!((glyphs[2].advance - 6.0).abs() < 0.001);
    // Byte ranges: あ and い are 3 bytes each, then U+10FFFF (4 bytes).
    assert_eq!(glyphs[0].source, 0..3);
    assert_eq!(glyphs[1].source, 3..6);
    assert_eq!(glyphs[2].source, 6..10);

    // Empty run yields no glyphs.
    assert!(face.positioned_glyphs("", 10.0, 0.0).is_empty());
}

#[test]
fn letter_spacing_widens_every_advance() {
    let store = ja_store();
    let face = store.face(None);
    // Spacing is added once per character, trailing char included, so
    // width grows by exactly n × spacing.
    let base = face.text_width("あいう", 10.0, 0.0);
    let spaced = face.text_width("あいう", 10.0, 2.5);
    assert!((spaced - (base + 3.0 * 2.5)).abs() < 1e-9);
    // Negative spacing tightens by the same rule.
    let tight = face.text_width("あいう", 10.0, -1.0);
    assert!((tight - (base - 3.0)).abs() < 1e-9);

    // Positioned glyphs carry the same policy: advances include the
    // spacing and x accumulates it, so drawing matches measurement.
    let glyphs = face.positioned_glyphs("あい", 10.0, 2.5);
    let unspaced = face.positioned_glyphs("あい", 10.0, 0.0);
    assert!((glyphs[0].advance - (unspaced[0].advance + 2.5)).abs() < 1e-9);
    assert_eq!(glyphs[0].x, 0.0);
    assert!((glyphs[1].x - glyphs[0].advance).abs() < 1e-9);
}

#[test]
fn glyph_path_extracts_and_flips_outline() {
    let store = ja_store();
    let face = store.face(None);
    // A CJK glyph has a rich outline: non-empty, starts with a move.
    let gid = face.glyph_id('永').expect("CJK glyph");
    let cmds = face.glyph_path(gid, 100.0).expect("outline");
    assert!(matches!(cmds.first(), Some(PathCmd::MoveTo(..))));
    assert!(cmds.len() > 4);
    // Size scales the outline: the same command at half the size has
    // different coordinates. Comparing the Debug form avoids
    // destructuring one known variant, which would leave the other
    // PathCmd match arms as dead branches.
    let small = face.glyph_path(gid, 50.0).expect("small");
    assert_eq!(small.len(), cmds.len());
    assert_ne!(format!("{:?}", cmds[0]), format!("{:?}", small[0]));
}

#[test]
fn glyph_path_is_none_for_empty_and_out_of_range() {
    let store = ja_store();
    let face = store.face(None);
    // The space glyph has no drawable outline.
    let space = face.glyph_id(' ').expect("space glyph");
    assert!(face.glyph_path(space, 20.0).is_none());
    // A glyph id far past the face's glyph count has no outline.
    assert!(face.glyph_path(u32::MAX, 20.0).is_none());
}

#[test]
fn garbage_bytes_fail_to_parse() {
    let result = FontFace::from_bytes("junk", vec![0, 1, 2, 3]);
    assert!(matches!(result, Err(FontError::Parse { ref id, .. }) if id == "junk"));
}

#[test]
fn missing_font_file_is_io_error() {
    // String id on purpose: production (`load_from_pack`) always calls
    // with String, and exercising a second generic instantiation would
    // leave the other one's error path uncovered per-instantiation.
    let result = FontFace::load("nope".to_string(), Path::new("/no/such/font.ttf"));
    assert!(matches!(result, Err(FontError::Io { .. })));
}

#[test]
fn debug_shows_id_and_size_not_bytes() {
    let store = ja_store();
    let debug = format!("{:?}", store.face(None));
    assert!(debug.contains("biz-udp-gothic"));
    assert!(debug.contains("bytes"));
}

#[test]
fn locale_without_fonts_is_rejected() {
    let pack = LangPack::from_yaml_str("id: xx-XX").expect("pack");
    let result = FontStore::load_from_pack(&pack, &[]);
    assert!(matches!(result, Err(FontError::NoFonts(ref id)) if id == "xx-XX"));
}

#[test]
fn locale_with_no_used_packs_has_no_faces() {
    // `default` is set but `uses` is empty → no faces resolve → NoFonts.
    let pack =
        LangPack::from_yaml_str("id: yy-YY\nfonts:\n  uses: []\n  default: biz-udp-gothic\n")
            .expect("pack");
    let result = FontStore::load_from_pack(&pack, &[super::test_support::repo_font_dir()]);
    assert!(matches!(result, Err(FontError::NoFonts(ref id)) if id == "yy-YY"));
}

#[test]
fn unknown_used_pack_is_a_pack_error() {
    let pack =
        LangPack::from_yaml_str("id: zz\nfonts:\n  uses: [ghost]\n  default: x\n").expect("pack");
    let result = FontStore::load_from_pack(&pack, &[super::test_support::repo_font_dir()]);
    assert!(matches!(result, Err(FontError::Pack(_))));
}

#[test]
fn locale_with_unknown_default_face_is_rejected() {
    // The biz-ud pack loads, but `default: ghost` is not one of its faces.
    let pack = LangPack::from_yaml_str("id: xx\nfonts:\n  uses: [biz-ud]\n  default: ghost\n")
        .expect("pack");
    let result = FontStore::load_from_pack(&pack, &[super::test_support::repo_font_dir()]);
    assert!(matches!(result, Err(FontError::UnknownFace(ref id)) if id == "ghost"));
}

#[test]
fn from_faces_builds_a_working_store() {
    let source = ja_store();
    let face = FontFace::from_bytes(
        "only",
        source.get("biz-udp-gothic").unwrap().data.as_ref().clone(),
    )
    .expect("face");
    let store = FontStore::from_faces(vec![face], "only").expect("store");
    assert_eq!(store.default_id(), "only");
    assert_eq!(store.faces().count(), 1);
}

#[test]
fn from_faces_rejects_bad_default() {
    let store = ja_store();
    let face = FontFace::from_bytes(
        "only",
        store.get("biz-udp-gothic").unwrap().data.as_ref().clone(),
    )
    .expect("face");
    let result = FontStore::from_faces(vec![face], "other");
    assert!(result.is_err());
}
