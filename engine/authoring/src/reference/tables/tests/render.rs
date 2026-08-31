//! Rendering. The invariant every test here circles is that a row emits one
//! cell per COLUMN — the property the hand-written tables did not have.

use crate::reference::tables::{render, Cell, Column, Missing};

/// Unescaped `|` count — the only honest way to measure a GFM row's width,
/// because `\|` is one character of CONTENT and not a cell boundary.
///
/// Counting `'|'` (or `"| "`) bills the escape too, and reports a row carrying
/// an alternation one cell wider than its header — which is exactly the trap
/// the escape exists to avoid, arriving in the test that checks it.
fn cells(line: &str) -> usize {
    let chars: Vec<char> = line.chars().collect();
    (0..chars.len())
        .filter(|&i| chars[i] == '|' && (i == 0 || chars[i - 1] != '\\'))
        .count()
}

/// The baseline spec's one table is all-authored, so give the rows their text.
fn table() -> crate::reference::tables::Table {
    let mut t = super::table();
    for (i, row) in t.rows.iter_mut().enumerate() {
        row.cells.insert("Type".to_owned(), format!("type {i}"));
        row.cells
            .insert("Description".to_owned(), format!("what key {i} does"));
        row.reason = Some("the fixture supplies its own text".to_owned());
    }
    t
}

fn rendered() -> String {
    render("box#keys", &table(), &super::registry()).expect("the baseline renders")
}

#[test]
fn renders_header_separator_and_one_line_per_row() {
    let out = rendered();
    let lines: Vec<&str> = out.split('\n').collect();
    assert_eq!(lines[0], "| Key | Type | Description |");
    assert_eq!(lines[1], "| --- | --- | --- |");
    assert_eq!(lines.len(), 4, "two rows under the header and separator");
}

#[test]
fn every_row_has_exactly_the_headers_cell_count() {
    // The nine broken rows of `diagnostics.md` are what this makes
    // unrepresentable: GFM drops every cell past the header's count, so a row
    // with one cell too many loses its last column silently.
    let out = rendered();
    let width = cells(out.split('\n').next().expect("a header"));
    for line in out.split('\n') {
        assert_eq!(cells(line), width, "{line}");
    }
}

#[test]
fn a_grouped_row_shows_the_pages_own_label() {
    assert!(
        rendered().contains("| `w` / `h` |"),
        "the label wins over the keys"
    );
}

#[test]
fn a_row_with_no_label_backticks_its_keys() {
    assert!(
        rendered().contains("| `fit` |"),
        "the keys render themselves"
    );
}

#[test]
fn a_pipe_inside_a_cell_is_escaped() {
    // The alternations these tables are full of (`contain` | `cover`) would
    // otherwise split one cell into two and shift every column after it.
    let mut t = table();
    t.rows[1]
        .cells
        .insert("Type".to_owned(), "`a` | `b`".to_owned());
    let out = render("t", &t, &super::registry()).expect("renders");
    assert!(out.contains(r"`a` \| `b`"), "the pipe is escaped: {out}");
    let width = cells(out.split('\n').next().expect("a header"));
    for line in out.split('\n') {
        assert_eq!(cells(line), width, "the escape kept the width: {line}");
    }
}

#[test]
fn a_newline_inside_a_cell_becomes_a_space() {
    // A markdown table row is one line; an embedded newline would end the
    // table early and leave the rest of the rows as prose.
    let mut t = table();
    t.rows[1]
        .cells
        .insert("Type".to_owned(), "two\nlines".to_owned());
    let out = render("t", &t, &super::registry()).expect("renders");
    assert!(out.contains("two lines"));
    assert_eq!(out.split('\n').count(), 4, "still one line per row");
}

#[test]
fn an_empty_cell_is_one_space_between_two_bars() {
    // How the doc set already writes it (`| \u{60}src\u{60} | string | | Bundled path,`
    // on image.md). Two spaces would break the byte-comparison gate on every
    // page carrying an empty cell.
    let mut t = table();
    t.rows[1].cells.insert("Type".to_owned(), String::new());
    let out = render("t", &t, &super::registry()).expect("renders");
    assert!(out.contains("| `fit` | | what key 1 does |"), "{out}");
}

#[test]
fn a_cell_no_source_can_fill_is_reported_rather_than_left_blank() {
    // An `authored` column with no text on the row. The report names the exact
    // cell, which is what makes the gate actionable without re-running
    // anything.
    let mut t = table();
    t.rows[0].cells.remove("Type");
    let err =
        render("box#keys", &t, &super::registry()).expect_err("an authored column with no text");
    assert_eq!(
        err,
        vec![Missing {
            id: "box#keys".to_owned(),
            key: "w".to_owned(),
            column: "Type".to_owned(),
        }]
    );
}

#[test]
fn every_missing_cell_is_reported_not_just_the_first() {
    let mut t = table();
    for column in ["extra one", "extra two"] {
        t.columns.push(Column {
            header: column.to_owned(),
            from: Cell::Authored,
        });
    }
    let err = render("t", &t, &super::registry()).expect_err("two authored columns with no text");
    assert_eq!(
        err.len(),
        4,
        "a page that grew a column wants the whole list"
    );
}

#[test]
fn a_row_with_no_keys_renders_no_key_cell() {
    let mut t = table();
    t.rows[1].keys.clear();
    t.rows[1].label = None;
    let out = render("t", &t, &super::registry()).expect("renders");
    assert!(out.contains("| | type 1 |"), "an empty key cell: {out}");
}
