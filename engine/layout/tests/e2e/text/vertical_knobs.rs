//! Vertical block knobs end to end (`src/engine/text/{vblock,vcol,
//! voverflow}.rs`): `verticalAlign` as the logical column-stack shift,
//! `textOverflow` against the box width, `textDecoration` side bands,
//! vertical `textSpacingTrim`, and hanging punctuation past the column
//! bottom. Fixed-pitch `biz-ud-gothic` (10pt, lineHeight 1.0) makes every
//! column 10pt wide and every upright cell 10pt tall, so geometry is
//! exact.

mod decoration;
mod hanging;
mod overflow;
mod trim;
mod valign;

/// A single vertical flow text item with a definite box; `box_kv`
/// replaces the whole box map, `style_extra` appends style keys.
pub(crate) fn tmpl(text: &str, box_kv: &str, style_extra: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 300, h: 300 }}
    items:
      - type: text
        text: "{text}"
        box: {{ {box_kv} }}
        style: {{ fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl{style_extra} }}
"#
    )
}
