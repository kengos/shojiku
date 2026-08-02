//! 大書き span notes (`markup: aozora`, `［＃「…」は大書き］`): a target
//! drawn across an n×n cell block. Block geometry (`geometry`), and the
//! compositions with ruby / pagination / clamp / verbatim (`compose`).

use super::grid_template;
use crate::common::*;

mod compose;
mod geometry;

/// The block text blocks (font size larger than the base 10pt cell size).
fn span_blocks(page: &LayoutPage) -> Vec<&TextBlock> {
    text_blocks(page)
        .into_iter()
        .filter(|b| b.font_size > 10.0)
        .collect()
}

/// One char_grid item authoring `text` with `markup: aozora`.
fn aozora(text: &str, grid: &str) -> String {
    grid_template(
        300.0,
        300.0,
        &format!("        text: {text}\n        grid: {grid}\n        markup: aozora\n"),
    )
}
