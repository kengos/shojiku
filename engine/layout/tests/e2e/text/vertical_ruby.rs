//! Vertical ruby (`ruby: [{ base, text }]`): reading columns beside
//! their base runs, shrink-to-fit, base matching, and the guards.
//! Fixed-pitch `biz-ud-gothic` at fontSize 10 / lineHeight 1.0 makes
//! every upright cell 10pt and the default reading size 5pt, so
//! positions are exact.

mod basic;
mod guards;
mod rich;

use crate::common::*;

/// A single vertical flow text item carrying ruby entries. `ruby_lines`
/// are YAML list lines (10-space indent); `extra` appends item-level
/// keys (8-space indent, leading newline included by the caller).
pub(super) fn tmpl(text: &str, ruby_lines: &str, extra: &str) -> String {
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
        box: {{ w: 200, h: 100 }}
        style: {{ fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl }}{extra}
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
