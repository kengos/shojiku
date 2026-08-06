//! `unknown_font_family`: a typo'd family warns once and falls
//! back to the default face; declared families resolve silently.

use crate::common::*;

#[test]
fn unknown_font_family_warns_once_and_falls_back() {
    // A typo'd fontFamily used to fall back to the default face with
    // no diagnostic (while a styleNames typo warned). It warns now — and
    // only once per family, even across many items.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: 一
        box: { x: 0, y: 0, w: 50 }
        style: { fontFamily: ipaexg }
      - type: text
        text: 二
        box: { x: 0, y: 30, w: 50 }
        style: { fontFamily: ipaexg }
      - type: list
        data: { key: items }
        box: { x: 0, y: 60, w: 100 }
        style: { fontFamily: ipaexg }
"#,
        json!({ "items": ["a", "b"] }),
    );
    let warns: Vec<_> = diags
        .iter()
        .filter(|d| d.code == "unknown_font_family")
        .collect();
    assert_eq!(warns.len(), 1, "deduped per family: {warns:?}");
    assert!(warns[0].message.contains("ipaexg"), "{warns:?}");
    // Fallback still renders: every block resolved to the default face.
    let store = ja_store();
    let default_id = store.default_id().to_string();
    for block in text_blocks(&doc.pages[0]) {
        assert_eq!(block.font_id, default_id);
    }
}

#[test]
fn known_family_and_face_id_do_not_warn() {
    // Every declared family resolves silently (variant faces are picked
    // via fontWeight/fontStyle, not by their face id — a bold face id in
    // fontFamily correctly warns as unknown).
    for family in ["biz-udp-gothic", "biz-ud-gothic", "ipamj-mincho"] {
        let (_, diags) = run(
            &format!(
                r#"
page: {{ margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: text
        text: 検
        box: {{ x: 0, y: 0, w: 50 }}
        style: {{ fontFamily: {family} }}
"#
            ),
            json!({}),
        );
        assert!(
            !diags.iter().any(|d| d.code == "unknown_font_family"),
            "{family}: {diags:?}"
        );
    }
}
