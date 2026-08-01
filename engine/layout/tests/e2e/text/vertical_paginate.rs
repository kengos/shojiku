//! Vertical column pagination end to end
//! (`src/engine/text/paginate/vertical.rs`): a direct-flow 縦書き block
//! needing more columns than its box width holds continues on the next
//! page in reading order, one fragment per page. Fixed-pitch
//! `biz-ud-gothic` (10pt, lineHeight 1.0) keeps the geometry exact.

mod guards;
mod ruby;
mod split;

/// A vertical flow text item (definite box) preceded by optional leading
/// flow items; `style_extra` appends style keys.
pub(crate) fn tmpl(text: &str, box_kv: &str, lead_items: &str, style_extra: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 300, h: 300 }}
    items:
{lead_items}      - type: text
        id: v
        text: "{text}"
        box: {{ {box_kv} }}
        style: {{ fontSize: 10, lineHeight: 1.0, fontFamily: biz-ud-gothic, writingMode: vertical_rl{style_extra} }}
"#
    )
}
