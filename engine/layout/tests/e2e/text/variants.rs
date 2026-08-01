//! Face-variant selection end to end: `fontWeight`/`fontStyle` pick a
//! real bold/italic face over synthetic emboldening when the family
//! declares one (fixture store + the bundled BIZ UD gothic lineup).

use crate::common::*;

#[test]
fn real_bold_variant_turns_synthetic_bold_off() {
    // With a font store whose `sans` family has a real bold face,
    // `fontWeight: bold` selects it (font_id = the bold face) and drops
    // synthetic emboldening; italic has no real variant so it stays
    // synthetic. The `mono` family (regular only) keeps synthetic bold.
    let fonts = variant_font_store();
    let (doc, diags) = run_with_fonts(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        text: real
        style: { fontFamily: sans, fontWeight: bold, fontStyle: italic }
      - type: text
        text: faux
        style: { fontFamily: mono, fontWeight: bold }
"#,
        json!({}),
        &fonts,
    );
    assert!(!diags.has_errors(), "{diags:?}");
    let texts = text_blocks(&doc.pages[0]);
    // sans/bold: real bold face chosen, synthetic bold off; italic has no
    // real variant, still synthetic.
    assert_eq!(texts[0].font_id, "sans-bold");
    assert!(!texts[0].synthetic_bold);
    assert!(texts[0].synthetic_italic);
    // mono has no bold face: regular face, synthetic bold stays on.
    assert_eq!(texts[1].font_id, "mono-regular");
    assert!(texts[1].synthetic_bold);
}

#[test]
fn biz_ud_gothic_family_selects_the_real_bold_face() {
    // The bundled ja pack carries a real BIZ UD bold, so
    // fontFamily: biz-udp-gothic + bold resolves it and drops synthetic
    // emboldening; ipamj-mincho (no bold face) stays synthetic.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        text: 見本
        style: { fontFamily: biz-udp-gothic, fontWeight: bold }
      - type: text
        text: 見本
        style: { fontFamily: ipamj-mincho, fontWeight: bold }
"#,
        json!({}),
    );
    assert!(!diags.has_errors(), "{diags:?}");
    let texts = text_blocks(&doc.pages[0]);
    assert_eq!(texts[0].font_id, "biz-udp-gothic-bold");
    assert!(!texts[0].synthetic_bold);
    assert_eq!(texts[1].font_id, "ipamj-mincho");
    assert!(texts[1].synthetic_bold);
}

#[test]
fn fallback_chain_covers_a_glyph_the_default_face_lacks() {
    // The ja pack's default (biz-udp-gothic) lacks `𠮷` (U+20BB7, the
    // 土吉 surname kanji, as in 𠮷野家) but the F3 fallback (ipamj-mincho)
    // has it, so it is NOT tofu; a truly uncoverable char still warns.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        text: "a𠮷b"
"#,
        json!({}),
    );
    // No missing_glyph: the fallback covered 𠮷.
    assert!(
        !diags.iter().any(|d| d.code == "missing_glyph"),
        "unexpected tofu: {diags:?}"
    );
    let block = &text_blocks(&doc.pages[0])[0];
    // The block carries the locale fallback chain for the renderers.
    assert_eq!(block.fallback_ids, vec!["ipamj-mincho".to_string()]);
    assert_eq!(block.font_id, "biz-udp-gothic");

    // A char in no bundled face still warns.
    let (_, diags) = run(
        "page: { margin: 0 }\nsections:\n  body:\n    type: flow\n    \
         box: { x: 0, y: 0, w: 400, h: 600 }\n    items:\n      \
         - type: text\n        text: \"\u{10FFFF}\"\n",
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "missing_glyph"));
}
