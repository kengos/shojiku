//! The aozora `［＃改ページ］` note: sheet breaks in a flow body, their
//! collapse rules, the single-sheet contexts that drop past-break
//! content, and the notes the engine renders literally instead.

use super::{grid_rects, grid_template, main_block};
use crate::common::*;

/// A 2x2-cell sheet on a page tall enough for exactly one sheet, so a
/// sheet break is observable as a page break.
fn break_grid(text: &str) -> String {
    grid_template(
        100.0,
        70.0,
        &format!(
            "        markup: aozora\n        text: \"{text}\"\n        grid: {{ charsPerLine: 2, lines: 2, cellSize: 20 }}\n"
        ),
    )
}

/// One roomy sheet (18 cells), for content that must land whole on one
/// page rather than exercise pagination.
fn wide_grid(text: &str) -> String {
    grid_template(
        100.0,
        200.0,
        &format!(
            "        markup: aozora\n        text: \"{text}\"\n        grid: {{ charsPerLine: 9, lines: 2, cellSize: 10 }}\n"
        ),
    )
}

#[test]
fn a_break_starts_a_new_sheet() {
    let (doc, diags) = run(&break_grid("あ［＃改ページ］い"), json!({}));
    assert_eq!(doc.pages.len(), 2);
    assert_eq!(all_text(&doc.pages[0]).replace('\n', ""), "あ");
    assert_eq!(all_text(&doc.pages[1]).replace('\n', ""), "い");
    // The break itself renders nothing: no note characters survive.
    assert!(!all_text(&doc.pages[0]).contains('＃'));
    assert!(diags.is_empty());
}

#[test]
fn content_after_a_break_starts_at_the_sheet_top() {
    let (doc, _) = run(&break_grid("あ［＃改ページ］い"), json!({}));
    let first = &main_block(&doc.pages[1]).lines[0];
    assert_eq!((first.x, first.y), (5.0, 5.0));
}

#[test]
fn a_break_ended_sheet_still_draws_its_full_grid() {
    // 原稿用紙 expectation: a title-and-author-only first sheet keeps
    // every マス — the break ends the CONTENT, never the ruled grid.
    // Vertical, like the real 原稿用紙 case: 4 columns × 3 cells = 12
    // stroked cells on BOTH pages, one filled, one nearly blank.
    let yaml = grid_template(
        200.0,
        100.0,
        "        writingMode: vertical_rl\n        markup: aozora\n        text: \"題名［＃改ページ］本文\"\n        grid: { charsPerLine: 3, lines: 4, cellSize: 20 }\n",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert_eq!(doc.pages.len(), 2);
    for page in &doc.pages {
        assert_eq!(grid_rects(page).len(), 12);
    }
    assert!(diags.is_empty());
}

#[test]
fn a_leading_break_adds_no_sheet() {
    let (doc, _) = run(&break_grid("［＃改ページ］あ"), json!({}));
    assert_eq!(doc.pages.len(), 1);
    assert_eq!(all_text(&doc.pages[0]).replace('\n', ""), "あ");
}

#[test]
fn consecutive_breaks_collapse() {
    let (doc, _) = run(&break_grid("あ［＃改ページ］［＃改ページ］い"), json!({}));
    assert_eq!(doc.pages.len(), 2);
    assert_eq!(all_text(&doc.pages[1]).replace('\n', ""), "い");
}

#[test]
fn a_trailing_break_adds_no_sheet() {
    let (doc, _) = run(&break_grid("あ［＃改ページ］"), json!({}));
    assert_eq!(doc.pages.len(), 1);
}

#[test]
fn a_break_mid_sheet_skips_the_rest_of_it() {
    // あいう fills line 0 and starts line 1 of a 2-line sheet; the break
    // sends え to sheet 1 rather than line 1's second cell.
    let (doc, _) = run(&break_grid("あいう［＃改ページ］え"), json!({}));
    assert_eq!(doc.pages.len(), 2);
    assert_eq!(all_text(&doc.pages[0]).replace('\n', ""), "あいう");
    assert_eq!(all_text(&doc.pages[1]).replace('\n', ""), "え");
}

#[test]
fn ruby_binds_on_the_sheet_a_break_opens() {
    // A reading immediately after a break: the break flags the annotated
    // run itself, and the reading must ride along to the new sheet.
    let (doc, diags) = run(&break_grid("あ［＃改ページ］山《やま》"), json!({}));
    assert_eq!(doc.pages.len(), 2);
    let second = all_text(&doc.pages[1]);
    assert!(second.contains('山'), "{second}");
    assert!(second.contains("やま"), "{second}");
    assert!(diags.is_empty());
}

#[test]
fn a_break_in_a_container_drops_the_content_past_it() {
    // Outside a flow body a char_grid draws exactly ONE sheet, so the
    // break's content lands past it and is dropped like any overflow.
    let yaml = "page:\n  size: { w: 200, h: 200 }\n  margin: 0\nsections:\n  body:\n    type: flow\n    items:\n      - type: container\n        box: { w: 100, h: 100 }\n        items:\n          - type: char_grid\n            style: { fontFamily: biz-ud-gothic, fontSize: 10 }\n            markup: aozora\n            text: \"あ［＃改ページ］い\"\n            grid: { charsPerLine: 2, lines: 2, cellSize: 20 }\n";
    let (doc, diags) = run(yaml, json!({}));
    let text = all_text(&doc.pages[0]).replace('\n', "");
    assert!(text.contains('あ'), "{text}");
    assert!(!text.contains('い'), "{text}");
    let overflow = diags
        .iter()
        .find(|d| d.code == "char_grid_overflow")
        .expect("char_grid_overflow");
    assert!(
        overflow.message.contains("1 characters dropped"),
        "{}",
        overflow.message
    );
}

#[test]
fn an_unsupported_note_renders_literally_and_warns() {
    // Only 改ページ is acted on; each character of any other note takes
    // its own cell, verbatim.
    let (doc, diags) = run(&wide_grid("あ［＃改行］い"), json!({}));
    assert_eq!(doc.pages.len(), 1);
    assert_eq!(all_text(&doc.pages[0]).replace('\n', ""), "あ［＃改行］い");
    let note = diags
        .iter()
        .find(|d| d.code == "aozora_note_ignored")
        .expect("aozora_note_ignored");
    // The diagnostic names the note it ignored (the scan capped it).
    assert!(note.message.contains("`改行`"), "{}", note.message);
}

#[test]
fn markup_off_renders_a_break_note_verbatim() {
    // The standing posture: without the opt-in, bound data is never
    // interpreted — every note character takes a cell.
    let yaml = grid_template(
        100.0,
        200.0,
        "        text: \"あ［＃改ページ］い\"\n        grid: { charsPerLine: 9, lines: 2, cellSize: 10 }\n",
    );
    let (doc, diags) = run(&yaml, json!({}));
    assert_eq!(doc.pages.len(), 1);
    assert_eq!(
        all_text(&doc.pages[0]).replace('\n', ""),
        "あ［＃改ページ］い"
    );
    assert!(diags.is_empty());
}

#[test]
fn hostile_break_runs_stop_at_the_page_cap() {
    // Every element breaks a sheet: the page cap must bound the run.
    let text = "あ［＃改ページ］".repeat(10_000);
    let (doc, diags) = run(&break_grid(&text), json!({}));
    assert_eq!(doc.pages.len(), MAX_PAGES);
    assert!(diags.iter().any(|d| d.code == "page_overflow"));
}
