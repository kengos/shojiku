//! `hangingPunctuation` (ぶら下げ) end to end (`src/style/enums.rs` →
//! cascade → `src/wrap/hang.rs` → `src/engine/text/block.rs`). Fixed-pitch
//! `biz-ud-gothic` at 10pt: a box `w: 25` fits two fullwidth glyphs, so a
//! trailing comma either wraps (default) or hangs.

use crate::common::*;

/// One flow text item with a selectable `hangingPunctuation`.
fn tmpl(hang: &str, text: &str, w: f64, align: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 500, h: 500 }}
    items:
      - type: text
        text: "{text}"
        box: {{ w: {w} }}
        style: {{ fontSize: 10, fontFamily: biz-ud-gothic, hangingPunctuation: {hang}, textAlign: {align} }}
"#
    )
}

#[test]
fn default_none_wraps_a_trailing_comma_with_kinsoku() {
    // "ああ、" in a 2-glyph-wide box: 、would start line 2, and kinsoku
    // (on by default) pulls a character down → two lines.
    let (doc, diags) = run(&tmpl("none", "ああ、", 25.0, "left"), json!({}));
    assert!(!diags.has_errors());
    assert_eq!(
        line_texts(text_blocks(&doc.pages[0])[0]),
        vec!["あ", "あ、"]
    );
}

#[test]
fn allow_end_hangs_the_comma_and_keeps_one_line() {
    // The same text hangs the comma past the edge instead of wrapping,
    // so it stays a single line and the count drops.
    let (doc, diags) = run(&tmpl("allow_end", "ああ、", 25.0, "left"), json!({}));
    assert!(!diags.has_errors());
    assert_eq!(line_texts(text_blocks(&doc.pages[0])[0]), vec!["ああ、"]);
}

#[test]
fn force_end_hangs_a_fitting_comma_out_of_the_alignment_width() {
    // "ああ、" fits a wide (100pt) box, so it never wraps. Under `none` the
    // comma is inside the right-aligned width; under `force_end` it is
    // excluded, so the line starts 10pt (one em) further right and the
    // comma hangs into the margin. The inked width still counts the comma.
    let (none, _) = run(&tmpl("none", "ああ、", 100.0, "right"), json!({}));
    let (force, _) = run(&tmpl("force_end", "ああ、", 100.0, "right"), json!({}));
    let nb = text_blocks(&none.pages[0])[0];
    let fb = text_blocks(&force.pages[0])[0];
    assert_eq!(line_texts(nb), vec!["ああ、"]);
    assert!(
        (nb.lines[0].x - 70.0).abs() < 0.01,
        "none x {}",
        nb.lines[0].x
    );
    assert!(
        (fb.lines[0].x - 80.0).abs() < 0.01,
        "force x {}",
        fb.lines[0].x
    );
    // Inked width includes the hung comma in both.
    assert!(
        (fb.lines[0].width - 30.0).abs() < 0.01,
        "width {}",
        fb.lines[0].width
    );
}

#[test]
fn allow_end_does_not_hang_a_fitting_comma_from_alignment() {
    // Unlike `force_end`, `allow_end` only hangs a comma that would wrap:
    // a fitting trailing comma stays inside the right-aligned width.
    let (doc, _) = run(&tmpl("allow_end", "ああ、", 100.0, "right"), json!({}));
    let b = text_blocks(&doc.pages[0])[0];
    assert!((b.lines[0].x - 70.0).abs() < 0.01, "x {}", b.lines[0].x);
}

#[test]
fn a_full_stop_before_a_closing_bracket_pushes_out_instead_of_hanging() {
    // The 「…。」 closing-quote pattern: hanging the 。 would leave 」 at a
    // line head (a kinsoku violation), so the cluster is pushed out whole —
    // identical to the no-hang result. Guards the hang×kinsoku hand-off
    // end to end.
    let (doc, diags) = run(
        &tmpl("allow_end", "ああああ。」い", 40.0, "left"),
        json!({}),
    );
    assert!(!diags.has_errors());
    let lines = line_texts(text_blocks(&doc.pages[0])[0]);
    assert_eq!(lines, vec!["あああ", "あ。」い"]);
    assert!(lines.iter().all(|l| !l.starts_with('」')));
}

#[test]
fn hanging_inherits_from_defaults_style() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
defaults:
  style: { fontFamily: biz-ud-gothic, hangingPunctuation: allow_end }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: text
        text: "ああ、"
        box: { w: 25 }
        style: { fontSize: 10 }
"#,
        json!({}),
    );
    assert!(!diags.has_errors());
    assert_eq!(line_texts(text_blocks(&doc.pages[0])[0]), vec!["ああ、"]);
}
