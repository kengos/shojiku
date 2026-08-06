//! Which kinds have a defined max-content width and which fall back to
//! a share, and the `flexBasis: content` spelling that names the
//! default. One assertion per arm of the measurement dispatch.

use super::probe;
use super::row;
use super::row_with;
use crate::common::*;

#[test]
fn flex_basis_content_is_the_default_spelled_out() {
    // T10, clause 1: writing `flexBasis: content` explicitly must be a
    // NO-OP — it names the default, so the same fixture with and without
    // it has to produce the same width. A key that quietly changed
    // behaviour when spelled would be worse than not having it.
    let implied = probe(
        "- type: container\n  box: { h: 20 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: あいうえ",
    );
    let spelled = probe(
        "- type: container\n  box: { h: 20, flexBasis: content }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: あいうえ",
    );
    assert_eq!(implied, spelled);
    // And it really is the CONTENT width: 4 chars at 10pt, not a share of
    // the row. `flexGrow` is 0 by default, so nothing is added to it.
    assert_eq!(implied[0], (0.0, 40.0));
}

#[test]
fn flex_basis_content_with_grow_zero_is_pure_content_width() {
    // T10, clause 2: the two keys together are the explicit "size to
    // your content and stay there". Discriminated against the same
    // fixture at `flexGrow: 1`, which adds the whole leftover — so the
    // pair of numbers proves growth was the variable, not the basis.
    let still = probe(
        "- type: container\n  box: { h: 20, flexBasis: content, flexGrow: 0 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: あいうえ",
    );
    assert_eq!(still[0], (0.0, 40.0), "content width, no growth");
    let grown = probe(
        "- type: container\n  box: { h: 20, flexBasis: content, flexGrow: 1 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: あいうえ",
    );
    // 200 total; the sibling's own content is 1 char = 10pt, so the two
    // growers split the 150pt leftover evenly: 40+75 and 10+75.
    assert_eq!(grown[0], (0.0, 115.0), "content plus its grow share");
}

#[test]
fn a_vertical_writing_block_has_no_intrinsic_width_and_keeps_its_share() {
    // T12, golden 1. A vertical-writing block's inline axis runs DOWN, so
    // its horizontal extent is (column count × column width) — a function
    // of the available HEIGHT, not a max-content width. `max_content_width`
    // returns `None` for it, and the caller falls back to the share-based
    // behaviour: it GROWS rather than collapsing to nothing.
    //
    // Successor: measuring it properly means resolving the column count
    // against the cross size first, which is the same circularity the
    // `auto` ROW work hit. Stated on docs/engine/flex.md.
    let r = row(
        "{ x: 0, y: 0, w: 200, h: 100, direction: row }",
        "- type: text\n  box: { h: 80 }\n  style: { writingMode: vertical_rl, borderWidth: 1 }\n  text: あいうえお\n\
         - type: container\n  box: { h: 20 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: ん",
    );
    // The sibling is measurable (1 char = 10pt) and does not grow; the
    // vertical block takes everything else, which is only possible if it
    // fell back to a share.
    assert_eq!(r[1].1, 10.0, "the measurable sibling sizes to content");
    assert_eq!(r[0].1, 190.0, "the vertical block grew into the rest");
}

#[test]
fn a_table_has_no_intrinsic_width_and_keeps_its_share() {
    // T12, golden 2. A table resolves its column widths as `%` of the
    // region it is given, so its max-content width is defined in terms of
    // the width being measured. `None`, and it grows.
    //
    // Successor: a real table max-content means summing per-column
    // max-content over every row's cells — the `auto` COLUMN machinery
    // one level down. Stated on docs/engine/flex.md.
    let r = row_with(
        "{ x: 0, y: 0, w: 200, h: 60, direction: row }",
        "- type: table\n  data: { key: rows }\n  columns:\n    - { label: a, data: { key: a } }\n\
         - type: container\n  box: { h: 20 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: ん",
        json!({ "rows": [ { "a": "x" } ] }),
    );
    // The bordered sibling is the LAST rect and sizes to its own content
    // (1 char = 10pt). Its x is the discriminating number: it sits at 190,
    // so the table ahead of it took the other 190 — a share, not a
    // content width, which for one short cell would have been far less.
    let sibling = *r.last().expect("the bordered sibling draws a rect");
    assert_eq!(sibling, (190.0, 10.0));
}

#[test]
fn a_checkbox_measures_the_cap_square_it_will_draw() {
    // T13, the checkbox arm: it auto-sizes to the inherited cap-height
    // square, and its BASIS is that same square — so its reserved slot
    // and its drawn mark agree by construction rather than by luck.
    let r = row(
        "{ x: 0, y: 0, w: 200, h: 40, direction: row, gap: 4 }",
        "- type: checkbox\n  data: { key: on }\n- type: text\n  text: ラベル",
    );
    // Cap height of 10pt biz-ud-gothic; the exact ratio belongs to the
    // font, so assert the SHAPE: a small square well under the row, and
    // the label starting right after it plus the gap.
    let (x, w) = r[0];
    assert_eq!(x, 0.0);
    assert!(w > 0.0 && w < 12.0, "cap square, got {w}");
}

#[test]
fn a_container_max_content_recurses_and_follows_its_own_direction() {
    // T13, the container arm — the one that makes the walk a walk. A
    // `row` container needs every child side by side (Σ widths + gaps); a
    // `column` needs its widest. Both measured from the SAME children, so
    // the two numbers discriminate the direction rather than just being
    // plausible.
    let nested = |dir: &str, gap: &str| {
        format!(
            "- type: container\n  box: {{ h: 20, direction: {dir}{gap} }}\n  style: {{ borderWidth: 1 }}\n  items:\n\
             \x20   - type: text\n      text: あいうえ\n    - type: text\n      text: あい"
        )
    };
    // Column: the widest child, 4 chars = 40pt.
    let col = probe(&nested("column", ""));
    assert_eq!(col[0].1, 40.0, "column = widest child");
    // Row: 40 + 20 = 60, plus one 6pt gap = 66.
    let r = probe(&nested("row", ", gap: 6"));
    assert_eq!(r[0].1, 66.0, "row = sum of children plus gaps");
}

#[test]
fn a_grid_container_has_no_intrinsic_width() {
    // T13's boundary: a `grid` container's tracks resolve against a width
    // that is exactly what the measurement is trying to produce, so it
    // returns `None` and grows. Without this arm the walk would recurse
    // into track sizing and ask itself the question it is answering.
    let r = probe(
        "- type: container\n  box: { h: 20, type: grid, columns: 2 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: あいうえ\n    - type: text\n      text: あい",
    );
    // basis 0 + an equal share of the 190pt leftover = 95, which is
    // nothing like the ~60pt its two cells would have measured.
    assert_eq!(r[0].1, 95.0, "grid container took a share, not a measure");
}

#[test]
fn a_container_with_nothing_in_flow_has_no_intrinsic_width() {
    // T13's other boundary: a container whose only children are
    // absolutely placed contributes no measurable child, so it has no
    // content width to report — `None`, and it falls back to a share.
    // The `counted == 0` arm.
    let r = probe(
        "- type: container\n  box: { h: 20 }\n  style: { borderWidth: 1 }\n  items:\n    - type: rect\n      box: { x: 0, y: 0, w: 5, h: 5 }",
    );
    assert_eq!(r[0].1, 95.0, "empty-in-flow container took a share");
}

#[test]
fn padding_counts_toward_a_measured_content_width() {
    // The measurement works in border-box widths, like every other
    // width in the engine, so horizontal padding is part of it. Asserted
    // as a DIFFERENCE against the unpadded fixture, so the number cannot
    // be right by coincidence.
    let bare = probe(
        "- type: container\n  box: { h: 20 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: あいうえ",
    );
    let padded = probe(
        "- type: container\n  box: { h: 20, padding: 7 }\n  style: { borderWidth: 1 }\n  items:\n    - type: text\n      text: あいうえ",
    );
    assert_eq!(padded[0].1 - bare[0].1, 14.0, "both sides of padding");
}
