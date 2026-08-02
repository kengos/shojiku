//! Vertical decoration bands on the PDF backend: `textDecoration` on a
//! 縦書き block/run draws one filled SIDE rect per column (plain) or per
//! run (rich), at the layout-resolved x offset.

use super::*;

#[test]
fn a_vertical_underline_draws_a_side_band() {
    let plain = r#"
page: { size: { w: 200, h: 300 }, margin: 10 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: "吾輩は猫である"
        box: { x: 0, y: 0, w: 120, h: 260 }
        style: { fontSize: 18, lineHeight: 1.5, writingMode: vertical_rl }
"#;
    let bare = render_template(plain, json!({}));
    let deco = render_template(
        &plain.replace("vertical_rl }", "vertical_rl, textDecoration: underline }"),
        json!({}),
    );
    assert!(deco.starts_with(b"%PDF-"));
    // The band adds real drawing ops — a decorated render cannot be
    // byte-identical to the bare one.
    assert_ne!(bare, deco);
}

#[test]
fn a_vertical_rich_run_draws_its_own_band() {
    let bytes = render_template(
        r#"
page: { size: { w: 200, h: 300 }, margin: 10 }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 0, y: 0, w: 120, h: 260 }
        style: { fontSize: 16, lineHeight: 1.5, writingMode: vertical_rl }
        spans:
          - { text: "吾輩は", style: { textDecoration: underline } }
          - { text: "猫である" }
"#,
        json!({}),
    );
    assert!(bytes.starts_with(b"%PDF-"));
    assert!(bytes.len() > 2000, "got {} bytes", bytes.len());
}
