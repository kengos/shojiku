//! Long-text pagination end to end (`src/engine/text/paginate.rs`):
//! oversized flow text splits at page boundaries like table rows,
//! fills partially-used pages, clones decoration per fragment, and
//! keeps atom-unit behavior everywhere else.

mod decoration;
mod slack;

use crate::common::*;

/// `n` one-word paragraphs → exactly `n` wrapped lines at any sane width.
pub(crate) fn numbered_lines(n: usize) -> String {
    (1..=n)
        .map(|i| format!("L{i}"))
        .collect::<Vec<_>>()
        .join("\\n")
}

fn flow_template(box_h: usize, extra: &str, content: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 200, h: {box_h} }}
    items:
      - type: text
        text: "{content}"{extra}
        style: {{ fontSize: 10, lineHeight: 1.0 }}
"#
    )
}

#[test]
fn oversized_text_splits_across_pages_at_line_boundaries() {
    // 120 lines at 10pt in a 500pt region: 50 + 50 + 20.
    let (doc, diags) = run(&flow_template(500, "", &numbered_lines(120)), json!({}));
    // No `section_overflow` — no diagnostics at all: splitting resolves
    // the overflow entirely.
    assert!(diags.items.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(doc.pages.len(), 3);
    let counts: Vec<usize> = doc
        .pages
        .iter()
        .map(|p| text_blocks(p)[0].lines.len())
        .collect();
    assert_eq!(counts, vec![50, 50, 20]);
    // Continuation pages restart at the region top.
    assert_eq!(text_blocks(&doc.pages[1])[0].lines[0].y, 0.0);
    assert_eq!(text_blocks(&doc.pages[1])[0].lines[0].text, "L51");
    assert_eq!(
        text_blocks(&doc.pages[2])[0]
            .lines
            .last()
            .map(|l| l.text.as_str()),
        Some("L120")
    );
}

#[test]
fn split_fills_the_remaining_space_before_breaking() {
    // A 2-line item first: the long text fills the other 48 line slots
    // on page 1 (table-row behavior), not a fresh page.
    let (doc, _) = run(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 200, h: 500 }}
    items:
      - type: text
        text: "A\nB"
        style: {{ fontSize: 10, lineHeight: 1.0 }}
      - type: text
        text: "{}"
        style: {{ fontSize: 10, lineHeight: 1.0 }}
"#,
            numbered_lines(60)
        ),
        json!({}),
    );
    assert_eq!(doc.pages.len(), 2);
    let page1 = text_blocks(&doc.pages[0]);
    assert_eq!(page1[1].lines.len(), 48);
    assert_eq!(page1[1].lines[0].y, 20.0, "starts at the cursor");
    assert_eq!(text_blocks(&doc.pages[1])[0].lines.len(), 12);
}

#[test]
fn definite_height_text_keeps_atom_unit_behavior() {
    // `box.h` is the T1 domain: no split, one page, the existing
    // text_overflow warning.
    let (doc, diags) = run(
        &flow_template(500, "\n        box: { h: 30 }", &numbered_lines(80)),
        json!({}),
    );
    assert_eq!(doc.pages.len(), 1);
    assert!(diags.iter().any(|d| d.code == "text_overflow"));
}

#[test]
fn containers_keep_atom_unit_page_breaking() {
    // Long text inside a container: the container atom does not split
    // (v1 decision) — it overflows with the existing warning.
    let (doc, diags) = run(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 200, h: 500 }}
    items:
      - type: container
        items:
          - type: text
            text: "{}"
            style: {{ fontSize: 10, lineHeight: 1.0 }}
"#,
            numbered_lines(80)
        ),
        json!({}),
    );
    assert_eq!(doc.pages.len(), 1);
    assert!(diags.iter().any(|d| d.code == "section_overflow"));
}

#[test]
fn fragments_carry_per_page_placements() {
    let out = run_full(
        &flow_template(500, "\n        id: agreement", &numbered_lines(60)),
        json!({}),
    );
    let pages = &out.boxes.pages;
    assert_eq!(pages.len(), 2);
    assert_eq!(pages[0][0].id.as_deref(), Some("agreement"));
    assert_eq!(pages[0][0].border.h, 500.0);
    assert_eq!(pages[1][0].id.as_deref(), Some("agreement"));
    assert_eq!(pages[1][0].border.h, 100.0);
}

#[test]
fn a_line_taller_than_the_page_still_terminates_with_warnings() {
    // Hostile metrics: each 600pt line overflows its own page; the loop
    // takes one line per page and the existing overflow warning fires.
    // Single-CJK-char paragraphs so hard-breaking cannot add lines.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 200, h: 500 }
    items:
      - type: text
        text: "あ\nあ\nあ"
        style: { fontSize: 600, lineHeight: 1.0 }
"#,
        json!({}),
    );
    assert_eq!(doc.pages.len(), 3);
    assert!(diags.iter().any(|d| d.code == "section_overflow"));
}

#[test]
fn the_page_cap_still_truncates_split_output() {
    // One line per 12pt page, 600 lines: the 500-page cap truncates with
    // the existing page_overflow diagnostic.
    let (doc, diags) = run(&flow_template(12, "", &numbered_lines(600)), json!({}));
    assert_eq!(doc.pages.len(), 500);
    assert!(diags.iter().any(|d| d.code == "page_overflow"));
}
