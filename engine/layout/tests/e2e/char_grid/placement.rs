//! Placement notes (`markup: aozora`): `［＃Ｎ字下げ］` / `［＃地付き］` /
//! `［＃地からＮ字上げ］` / `［＃中央］` position a source line, overriding
//! the item's `textAlign`. Indent geometry (`indent`), the title-sheet
//! compositions and end-align overrides (`compose`).

use super::main_block;
use crate::common::*;

mod compose;
mod indent;

/// The x of the cell holding `ch` in the main (base-size) block.
fn cell_x(page: &LayoutPage, ch: char) -> f64 {
    main_block(page)
        .lines
        .iter()
        .find(|l| l.text == ch.to_string())
        .unwrap_or_else(|| panic!("cell {ch} not found"))
        .x
}

/// A single char_grid item authoring `text` under `markup: aozora` with an
/// optional item-level `textAlign`. Builds the whole template so the
/// item's `style:` map stays a single node (the fixed-pitch face keeps
/// positions metric-exact) — `grid_template` bakes its own `style:`, so a
/// second map would be a duplicate key. `text` is a DOUBLE-QUOTED YAML
/// scalar, so a `\n` in it (write `\\n` in the Rust literal) is a real
/// newline the grid breaks a line on — a plain scalar would keep it literal.
fn placed(text: &str, grid: &str, align: Option<&str>) -> String {
    let align = align.map_or(String::new(), |a| format!(", textAlign: {a}"));
    format!(
        "page:\n  size: {{ w: 300, h: 300 }}\n  margin: 0\nsections:\n  body:\n    type: flow\n    items:\n      - type: char_grid\n        style: {{ fontFamily: biz-ud-gothic, fontSize: 10{align} }}\n        text: \"{text}\"\n        grid: {grid}\n        markup: aozora\n"
    )
}
