//! Unmapped-glyph diagnostics: `missing_glyph` dedupe and hostile
//! input bounding.

use crate::common::*;

#[test]
fn missing_glyph_warns_once_per_distinct_char() {
    // U+10FFFF has no glyph in any bundled face; a newline (control char)
    // must be ignored, and the repeated unmapped char must warn only once.
    let text = "\u{10FFFF}\n\u{10FFFF}A";
    let yaml = format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 500, h: 500 }}
    items:
      - type: text
        text: "{text}"
"#
    );
    let (_, diags) = run(&yaml, json!({}));
    let missing: Vec<_> = diags.iter().filter(|d| d.code == "missing_glyph").collect();
    assert_eq!(missing.len(), 1, "expected one deduped warning");
    assert!(missing[0].message.contains("blank boxes"));
    // Only the single distinct offender, so no truncation ellipsis.
    assert!(!missing[0].message.contains('…'));
    // The all-mappable "A" in the same run exercises the no-push path
    // (a char the face maps → nothing added to the offender set).
}

#[test]
fn missing_glyph_message_is_bounded_for_hostile_input() {
    // Content is untrusted and unbounded: many distinct unmappable code
    // points must not produce an unbounded diagnostic (echo + O(n^2)).
    // U+E000..U+F8FF is the Private Use Area — no glyphs in the bundled
    // faces (BIZ UD gothic / IPAmj明朝).
    let hostile: String = (0xE000u32..0xE000 + 200)
        .filter_map(char::from_u32)
        .collect();
    let yaml = format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 500, h: 500 }}
    items:
      - type: text
        text: "{hostile}"
"#
    );
    let (_, diags) = run(&yaml, json!({}));
    let msg = &diags
        .iter()
        .find(|d| d.code == "missing_glyph")
        .expect("warning")
        .message;
    // Capped at MAX_MISSING_GLYPHS distinct chars plus the ellipsis
    // marker; the 200 offenders never all reach the message.
    assert!(msg.contains('…'), "expected truncation marker: {msg}");
    let len = msg.chars().count();
    assert!(len < 200, "message not bounded: {len}");
}
