//! Wire tests for `type: char_grid`: parse, defaults, round-trip.

use super::*;
use crate::WritingMode;

fn grid_from(yaml: &str) -> CharGridItem {
    let tpl = parse_template(yaml).expect("template should parse");
    let Body::Flow(flow) = &tpl.sections.body else {
        panic!("expected flow body");
    };
    let Item::CharGrid(grid) = &flow.items[0] else {
        panic!("expected char_grid item");
    };
    grid.clone()
}

#[test]
fn parses_full_char_grid() {
    let grid = grid_from(
        r#"
sections:
  body:
    type: flow
    items:
      - type: char_grid
        id: manuscript
        box: { x: 0, y: 0 }
        data: { key: body_text }
        grid: { charsPerLine: 20, lines: 10, cellSize: 10mm, lineGap: 4mm, charGap: 1 }
        writingMode: vertical_rl
        kinsoku: school
        markup: aozora
        rubySize: 3mm
        style: { fontSize: 18 }
"#,
    );
    assert_eq!(grid.grid.chars_per_line, 20);
    assert_eq!(grid.grid.lines, 10);
    assert_eq!(grid.writing_mode(), WritingMode::VerticalRl);
    assert_eq!(grid.kinsoku(), KinsokuMode::School);
    assert_eq!(grid.markup(), Some(Markup::Aozora));
    assert!(grid.ruby_size.is_some());
    assert!(grid.grid.cell_size.is_some());
}

#[test]
fn defaults_are_horizontal_school_verbatim() {
    let grid = grid_from(
        r#"
sections:
  body:
    type: flow
    items:
      - type: char_grid
        text: あいうえお
        grid: { charsPerLine: 5, lines: 2 }
"#,
    );
    assert_eq!(grid.writing_mode(), WritingMode::HorizontalTb);
    assert_eq!(grid.kinsoku(), KinsokuMode::School);
    assert_eq!(grid.markup(), None);
    assert!(grid.grid.cell_size.is_none());
    assert!(grid.grid.line_gap.is_none());
    assert!(grid.grid.char_gap.is_none());
}

#[test]
fn item_id_reaches_the_generic_accessor() {
    let tpl = parse_template(
        r#"
sections:
  body:
    type: flow
    items:
      - type: char_grid
        id: boxes
        text: あ
        grid: { charsPerLine: 1, lines: 1 }
"#,
    )
    .expect("parse");
    let Body::Flow(flow) = &tpl.sections.body else {
        panic!("expected flow body");
    };
    assert_eq!(flow.items[0].id(), Some("boxes"));
}

#[test]
fn kinsoku_none_parses() {
    let grid = grid_from(
        r#"
sections:
  body:
    type: flow
    items:
      - type: char_grid
        text: abc
        grid: { charsPerLine: 3, lines: 1 }
        kinsoku: none
"#,
    );
    assert_eq!(grid.kinsoku(), KinsokuMode::None);
}

#[test]
fn unknown_key_is_a_parse_error() {
    let err = parse_template(
        r#"
sections:
  body:
    type: flow
    items:
      - type: char_grid
        text: abc
        grid: { charsPerLine: 3, lines: 1 }
        zzz: 1
"#,
    )
    .expect_err("unknown key must reject");
    assert!(err.to_string().contains("zzz"), "{err}");
}

#[test]
fn unknown_grid_key_is_a_parse_error() {
    parse_template(
        r#"
sections:
  body:
    type: flow
    items:
      - type: char_grid
        text: abc
        grid: { charsPerLine: 3, lines: 1, zzz: 2 }
"#,
    )
    .expect_err("unknown grid key must reject");
}

#[test]
fn missing_grid_dimensions_are_parse_errors() {
    parse_template(
        r#"
sections:
  body:
    type: flow
    items:
      - type: char_grid
        text: abc
        grid: { charsPerLine: 3 }
"#,
    )
    .expect_err("missing lines must reject");
}

#[test]
fn unknown_enum_values_are_parse_errors() {
    parse_template(
        r#"
sections:
  body:
    type: flow
    items:
      - type: char_grid
        text: abc
        grid: { charsPerLine: 3, lines: 1 }
        markup: latex
"#,
    )
    .expect_err("unknown markup must reject");
}

#[test]
fn minimal_item_round_trips_without_injected_defaults() {
    let grid = grid_from(
        r#"
sections:
  body:
    type: flow
    items:
      - type: char_grid
        text: あい
        grid: { charsPerLine: 2, lines: 1 }
"#,
    );
    let yaml = serde_yaml::to_string(&grid).expect("serialize");
    // Only the authored keys appear: no writingMode/kinsoku/markup/
    // rubySize/cellSize/gaps injected. (`id:` would be shadowed by the
    // `grid:` substring, so it is asserted via the line-start form.)
    assert!(
        !yaml.starts_with("id:") && !yaml.contains("\nid:"),
        "{yaml}"
    );
    for absent in [
        "writingMode",
        "kinsoku",
        "markup",
        "rubySize",
        "cellSize",
        "lineGap",
        "charGap",
        "box",
        "data",
    ] {
        assert!(!yaml.contains(absent), "unexpected `{absent}` in: {yaml}");
    }
    assert!(yaml.contains("charsPerLine: 2"), "{yaml}");
}
