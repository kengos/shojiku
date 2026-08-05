//! `textOverflow` on a vertical block: the policy runs against the box
//! WIDTH (columns stack right-to-left) — clip reserves and cuts, shrink
//! bisects the font size, ellipsis keeps whole columns and ends the last
//! one with `…`; rich spans keep the horizontal parity (clip honored,
//! shrink/ellipsis warn).

use super::tmpl;
use super::valign::count_code;
use crate::common::*;

#[test]
fn clip_wraps_the_block_and_keeps_every_column() {
    // 15 chars → 5 columns (50pt) in a 25pt box: all columns kept, the
    // block clipped at the border box, and no overflow warning (the
    // author opted in to cutting).
    let (doc, diags) = run(
        &tmpl(
            "あいうえおかきくけこさしすせそ",
            "w: 25, h: 30",
            ", textOverflow: clip",
        ),
        json!({}),
    );
    assert_eq!(count_code(&diags, "vertical_text_overflow"), 0);
    assert!(
        text_blocks(&doc.pages[0]).is_empty(),
        "block moved into the clip"
    );
    let clip = crate::clip::only_clip(&doc.pages[0]);
    assert!((clip.w - 25.0).abs() < 0.01);
    let block = clip
        .items
        .iter()
        .find_map(|i| match i {
            shojiku_layout::LayoutItem::Text(b) => Some(b),
            _ => None,
        })
        .expect("clipped block");
    assert_eq!(block.lines.len(), 5);
}

#[test]
fn shrink_bisects_until_the_columns_fit() {
    // 10 chars at 10pt: 3 cells per 30pt column → 4 columns (40pt) in a
    // 25pt box. Shrinking scales the column width with the size, so the
    // fitted block's columns occupy at most the content width.
    let (doc, diags) = run(
        &tmpl(
            "あいうえおかきくけこ",
            "w: 25, h: 30",
            ", textOverflow: shrink",
        ),
        json!({}),
    );
    assert_eq!(count_code(&diags, "vertical_text_overflow"), 0);
    let block = text_blocks(&doc.pages[0])[0];
    assert!(block.font_size < 10.0, "{}", block.font_size);
    assert!(block.font_size >= 4.0);
    let needed = block.lines.len() as f64 * block.line_height;
    assert!(needed <= 25.01, "still overflows: {needed}");
}

#[test]
fn shrink_at_its_floor_keeps_the_floor_and_warns() {
    // A 5pt box cannot hold even the 4pt-floor columns of a long text:
    // the floor is kept, the overflow warns, and the flow does NOT
    // paginate a policy-handled overflow (one page).
    let long = "あいうえおかきくけこ".repeat(8);
    let (doc, diags) = run(
        &tmpl(&long, "w: 5, h: 30", ", textOverflow: shrink"),
        json!({}),
    );
    assert_eq!(doc.pages.len(), 1);
    assert!(diags.iter().any(|d| d.code == "vertical_text_overflow"));
    let block = text_blocks(&doc.pages[0])[0];
    assert!((block.font_size - 4.0).abs() < 1e-9);
}

#[test]
fn ellipsis_keeps_whole_columns_and_ends_the_last_with_dots() {
    // 20 chars → 7 columns; a 25pt box caps at 2. The second column is
    // trimmed to make room for the `…` within its 30pt length.
    let (doc, diags) = run(
        &tmpl(
            "あいうえおかきくけこさしすせそたちつてと",
            "w: 25, h: 30",
            ", textOverflow: ellipsis",
        ),
        json!({}),
    );
    assert_eq!(count_code(&diags, "vertical_text_overflow"), 0);
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(line_texts(block), vec!["あいう", "えお…"]);
    assert_eq!(doc.pages.len(), 1, "resolved overflow never paginates");
}

#[test]
fn ellipsis_with_no_room_for_a_single_column_warns_and_clamps_to_nothing() {
    let (doc, diags) = run(
        &tmpl("あいうえお", "w: 5, h: 30", ", textOverflow: ellipsis"),
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "vertical_text_overflow"));
    let block = text_blocks(&doc.pages[0])[0];
    assert!(block.lines.is_empty());
}

#[test]
fn content_exactly_at_the_column_cap_runs_no_policy() {
    // 6 chars = exactly 2 columns = exactly the 20pt box: no overflow, no
    // warning, no clamp — the boundary the cap admits.
    let (doc, diags) = run(
        &tmpl("あいうえおか", "w: 20, h: 30", ", textOverflow: ellipsis"),
        json!({}),
    );
    assert_eq!(count_code(&diags, "vertical_text_overflow"), 0);
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(line_texts(block), vec!["あいう", "えおか"]);
}

#[test]
fn rich_spans_keep_the_vertical_text_overflow_parity() {
    // A rich vertical block in a container (no pagination there): clip is
    // honored; shrink warns `span_overflow_unsupported` and overflows
    // like visible.
    let rich = |overflow: &str| {
        format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 300, h: 300 }}
    items:
      - type: container
        box: {{ w: 300, h: 120 }}
        items:
          - type: text
            box: {{ x: 100, y: 0, w: 15, h: 100 }}
            style: {{ fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0, writingMode: vertical_rl, textOverflow: {overflow} }}
            spans:
              - text: "あいうえおかきくけこさし"
"#
        )
    };
    let (doc, diags) = run(&rich("clip"), json!({}));
    assert_eq!(count_code(&diags, "span_overflow_unsupported"), 0);
    assert_eq!(crate::clip::clip_shapes(&doc.pages[0]).len(), 1);
    let (_doc, diags) = run(&rich("shrink"), json!({}));
    assert_eq!(count_code(&diags, "span_overflow_unsupported"), 1);
    assert!(diags.iter().any(|d| d.code == "vertical_text_overflow"));
}

#[test]
fn an_ellipsis_clamp_never_ends_on_an_opening_bracket() {
    // The last kept column is おか「き; making room for the `…` keeps
    // おか「 — 行末禁則 then strips the opening bracket so the clamp
    // never ends `「…`.
    let (doc, _d) = run(
        &tmpl(
            "あいうえおか「きくけこ",
            "w: 25, h: 40",
            ", textOverflow: ellipsis",
        ),
        json!({}),
    );
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(line_texts(block), vec!["あいうえ", "おか…"]);
}

#[test]
fn a_hostile_negative_font_size_degrades_on_the_policy_path() {
    // `sane_font_size` rejects the -5 before any policy math runs: the
    // block builds at the fallback size, warns `invalid_font_size`, and
    // the ellipsis path never panics.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: text
        text: "あいうえお"
        box: { w: 25, h: 30 }
        style: { fontFamily: biz-ud-gothic, fontSize: -5, lineHeight: 1.0, writingMode: vertical_rl, textOverflow: ellipsis }
"#,
        json!({}),
    );
    assert_eq!(doc.pages.len(), 1);
    assert!(diags.iter().any(|d| d.code == "invalid_font_size"));
}

#[test]
fn an_unconstrained_basis_ellipsizes_without_trimming_or_spinning() {
    // An auto-height container ancestor frees the column length (∞
    // basis): one column per paragraph. Four paragraphs overflow the
    // 25pt width (cap 2); the ellipsis keeps two columns and appends
    // `…` without trimming (∞ always has room below).
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: container
        items:
          - type: text
            text: "ああ\nいい\nうう\nええ"
            box: { x: 0, y: 0, w: 25 }
            style: { fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0, writingMode: vertical_rl, textOverflow: ellipsis }
"#,
        json!({}),
    );
    assert!(!diags.has_errors());
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(line_texts(block), vec!["ああ", "いい…"]);
}

#[test]
fn an_unconstrained_basis_shrink_scales_the_column_width_to_fit() {
    // Shrinking cannot reduce a per-paragraph column COUNT, but the
    // column width scales with the size, so the fixed-step bisection
    // still lands the four columns inside the box — bounded, no spin.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 300, h: 300 }
    items:
      - type: container
        items:
          - type: text
            text: "ああ\nいい\nうう\nええ"
            box: { x: 0, y: 0, w: 25 }
            style: { fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0, writingMode: vertical_rl, textOverflow: shrink }
"#,
        json!({}),
    );
    assert!(!diags.iter().any(|d| d.code == "vertical_text_overflow"));
    let block = text_blocks(&doc.pages[0])[0];
    assert!(block.font_size < 10.0, "{}", block.font_size);
    let needed = block.lines.len() as f64 * block.line_height;
    assert!(needed <= 25.01, "still overflows: {needed}");
}
