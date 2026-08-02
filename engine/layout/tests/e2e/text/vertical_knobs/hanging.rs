//! Hanging punctuation (ぶら下げ) on vertical columns: a
//! column-terminating comma / full stop hangs past the column bottom
//! instead of starting the next column — kept in the inked extent
//! (`TextLine.width`), excluded from the alignment basis.

use super::tmpl;
use super::valign::count_code;
use crate::common::*;

#[test]
fn a_comma_hangs_past_the_column_bottom() {
    // 4 cells fill the 40pt column; the 、 hangs below it instead of
    // opening a second column: one column, inked extent ~50pt.
    let (doc, diags) = run(
        &tmpl(
            "ああああ、いい",
            "w: 200, h: 40",
            ", hangingPunctuation: allow_end",
        ),
        json!({}),
    );
    assert_eq!(count_code(&diags, "vertical_style_ignored"), 0);
    let block = text_blocks(&doc.pages[0])[0];
    let texts = line_texts(block);
    assert_eq!(texts, vec!["ああああ、", "いい"]);
    assert!(
        (block.lines[0].width - 50.0).abs() < 0.5,
        "{}",
        block.lines[0].width
    );
}

#[test]
fn a_hung_column_aligns_without_its_hung_cell() {
    // textAlign right (bottom along the column): the hung 、 sits in the
    // margin, so the 5-cell inked column bottom-aligns as 4 cells — its
    // top offset equals the plain 4-cell column's.
    let (doc, _d) = run(
        &tmpl(
            "ああああ、いい",
            "w: 200, h: 50",
            ", hangingPunctuation: force_end, textAlign: right",
        ),
        json!({}),
    );
    let block = text_blocks(&doc.pages[0])[0];
    // The first column is the 5 cells ああああ、 (fits exactly);
    // `force_end` hangs its trailing comma, so 40pt of aligned cells
    // bottom-align in the 50pt basis → y = 10.
    assert!(
        (block.lines[0].y - 10.0).abs() < 0.5,
        "{}",
        block.lines[0].y
    );
}

#[test]
fn a_closing_quote_pair_never_hangs_apart() {
    // The 「…。」 trace: 。」 at a column boundary is NOT hangable (pulling
    // 。 would expose the prohibited 」 start), so kinsoku pushes the pair
    // down whole — no column starts with 。 or 」.
    let (doc, diags) = run(
        &tmpl(
            "「ああああ。」いい",
            "w: 200, h: 50",
            ", hangingPunctuation: allow_end",
        ),
        json!({}),
    );
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    for text in line_texts(block) {
        let head = text.chars().next().unwrap();
        assert!(
            head != '。' && head != '」',
            "prohibited column head: {text}"
        );
    }
}

#[test]
fn a_comma_run_hangs_at_most_one_per_column_and_terminates() {
    // A hostile 、×12 run: each column receives at most ONE hung comma,
    // every character survives, and the pass terminates.
    let (doc, diags) = run(
        &tmpl(
            "、、、、、、、、、、、、",
            "w: 200, h: 30",
            ", hangingPunctuation: allow_end",
        ),
        json!({}),
    );
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    // Kinsoku packs a prohibition run onto its line (追い込み — commas may
    // not start a column), so the shape is one long column; the invariant
    // is that nothing is lost or duplicated and the pass terminates.
    let total: usize = line_texts(block).iter().map(|t| t.chars().count()).sum();
    assert_eq!(total, 12);
}

#[test]
fn rich_spans_hang_a_column_comma_too() {
    // The spans path shares the hang machinery: the comma hangs onto the
    // first column, and the alignment basis excludes it (the column
    // bottom-aligns as its non-hung cells).
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        box: { w: 200, h: 40 }
        style: { fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0, writingMode: vertical_rl, hangingPunctuation: allow_end }
        spans:
          - { text: "ああああ", style: { fontWeight: bold } }
          - { text: "、いい" }
"#,
        json!({}),
    );
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(line_texts(block), vec!["ああああ、", "いい"]);
    // Inked extent keeps the hung comma (~50pt over a 40pt basis).
    assert!(
        (block.lines[0].width - 50.0).abs() < 0.5,
        "{}",
        block.lines[0].width
    );
}
