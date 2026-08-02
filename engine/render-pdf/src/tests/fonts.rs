//! Font drawing: the F3 fallback-chain run and synthetic emboldening.

use super::*;

#[test]
fn renders_fallback_chain_glyph_from_the_secondary_face() {
    // The default face (biz-udp-gothic) lacks 𠮷 (U+20BB7, the 土吉
    // surname kanji) but the ja pack's F3 fallback (ipamj-mincho) has it,
    // so layout tags the glyph with a non-zero face_index and draw_text
    // groups the line into per-face runs, pulling 𠮷 from the fallback
    // face. Exercises this backend's fallback-run draw path.
    let bytes = render_template(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 25, y: 100, w: 500, h: 600 }
    items:
      - type: text
        text: 山田𠮷子
        style: { fontSize: 20 }
"#,
        json!({}),
    );
    assert!(bytes.starts_with(b"%PDF-"));
}

#[test]
fn renders_synthetic_bold_text() {
    // ipamj-mincho has no real bold face, so fontWeight: bold triggers
    // synthetic emboldening (krilla stroke + fill) in this backend —
    // unlike the default biz-udp, which selects its real bold face.
    let bytes = render_template(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 25, y: 100, w: 500, h: 600 }
    items:
      - type: text
        text: 太字見本
        style: { fontFamily: ipamj-mincho, fontWeight: bold }
"#,
        json!({}),
    );
    assert!(bytes.starts_with(b"%PDF-"));
}
