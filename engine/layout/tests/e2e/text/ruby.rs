//! Horizontal ruby (`ruby: [{ base, text }]` on a `horizontal_tb` text
//! item): readings drawn ABOVE their base runs, shrink-to-fit, matching,
//! proportional splits across wrapped lines, and flow pagination.
//! Fixed-pitch `biz-ud-gothic` at fontSize 10 (full-width glyphs exactly
//! 1em) with lineHeight 2.0 (room for the reading band) keeps geometry
//! exact; the default reading size is 5pt.

mod basic;
mod guards;
mod paginate;
mod rich;

use crate::common::*;

/// A single horizontal flow text item carrying ruby entries.
/// `ruby_lines` are YAML list lines (10-space indent); `extra` appends
/// item-level keys (8-space indent, leading newline included by the
/// caller); `style_extra` appends style keys (leading `, ` included).
pub(super) fn tmpl(text: &str, ruby_lines: &str, extra: &str, style_extra: &str) -> String {
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
        box: {{ w: 200 }}
        style: {{ fontSize: 10, lineHeight: 2.0, fontFamily: biz-ud-gothic{style_extra} }}{extra}
        ruby:
{ruby_lines}
"#
    )
}

/// Every reading block (smaller than the 10pt base block).
pub(super) fn ruby_blocks(page: &LayoutPage) -> Vec<&TextBlock> {
    text_blocks(page)
        .into_iter()
        .filter(|b| b.font_size < 10.0)
        .collect()
}

/// The main (base) block: the one at the full 10pt size.
pub(super) fn main_block(page: &LayoutPage) -> &TextBlock {
    text_blocks(page)
        .into_iter()
        .find(|b| b.font_size >= 10.0)
        .expect("main block")
}
