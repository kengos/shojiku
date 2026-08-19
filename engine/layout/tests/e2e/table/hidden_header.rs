//! `header.visuallyHidden` end to end: the row paints nothing while its
//! labels stay in the text layer, it keeps its height, and its spanning
//! group row hides with it.
//!
//! Split from `style.rs`, which sits near the 300-line budget.

use crate::common::*;

/// A one-column table with a label, plus whatever `header:`/`headerGroups:`
/// block the caller wants above the columns.
fn labelled_table(extra: &str) -> (LayoutDocument, Diagnostics) {
    run(
        &format!(
            r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: 600 }}
    items:
      - type: table
        data: {{ key: items }}
{extra}        columns:
          - label: 名前
            data: {{ key: n }}
            width: 100
"#
        ),
        json!({ "items": [ {"n": 1} ] }),
    )
}

const HIDDEN: &str = "        header:\n          visuallyHidden: true\n";

#[test]
fn a_visually_hidden_header_keeps_its_label_in_the_text_layer() {
    let (doc, diags) = labelled_table(HIDDEN);
    assert!(diags.is_empty(), "diags: {:?}", diags);
    // The point of the feature: an extractor (or an AI reading the PDF) still
    // sees what the column means.
    assert!(all_text(&doc.pages[0]).contains("名前"));
    // …drawn at a paint alpha of zero, which is what makes it invisible while
    // krilla still writes the glyph-showing operators.
    let label = text_blocks(&doc.pages[0])
        .into_iter()
        .find(|b| b.lines.iter().any(|l| l.text.contains("名前")))
        .expect("the header label block");
    assert_eq!(label.opacity, 0.0);
}

#[test]
fn a_visually_hidden_header_paints_no_band_and_no_grid() {
    let (visible, _) = labelled_table("");
    let (hidden, _) = labelled_table(HIDDEN);
    // Positive control: the visible header DOES paint a filled band, so a
    // zero below means "suppressed", not "this table never had one".
    let filled = |doc: &LayoutDocument| {
        rect_shapes(&doc.pages[0])
            .into_iter()
            .filter(|r| r.fill.is_some())
            .count()
    };
    assert!(filled(&visible) > 0);
    assert_eq!(filled(&hidden), filled(&visible) - 1, "the header band");
    // The grid ruling is drawn from the table FRAME, not from the row's own
    // style, so it is the one thing `header.style` alone could never switch
    // off — an empty ruled box is still visible.
    let strokes = |doc: &LayoutDocument| {
        rect_shapes(&doc.pages[0])
            .into_iter()
            .filter(|r| r.stroke.is_some())
            .count()
    };
    assert!(strokes(&visible) > strokes(&hidden));
}

#[test]
fn a_visually_hidden_header_keeps_its_height() {
    // "Invisible", not "absent": if the row collapsed, the labels would land
    // on top of the first data row.
    let (visible, _) = labelled_table("");
    let (hidden, _) = labelled_table(HIDDEN);
    let first_body_y = |doc: &LayoutDocument| {
        text_blocks(&doc.pages[0])
            .into_iter()
            .filter(|b| b.lines.iter().any(|l| l.text.contains('1')))
            .map(|b| b.lines[0].y)
            .fold(f64::INFINITY, f64::min)
    };
    assert_eq!(first_body_y(&hidden), first_body_y(&visible));
}

#[test]
fn hiding_the_header_hides_its_spanning_group_row_too() {
    // The group row repeats WITH the header and draws above it; leaving it
    // painted would show a lone grey band over nothing.
    let groups = "        headerGroups:\n          - { label: 小計, span: 1 }\n";
    let (shown, _) = labelled_table(groups);
    let (hidden, _) = labelled_table(&format!("{groups}{HIDDEN}"));
    assert!(all_text(&shown.pages[0]).contains("小計"));
    // The group label survives in the text layer, transparent like the rest.
    assert!(all_text(&hidden.pages[0]).contains("小計"));
    let group_block = text_blocks(&hidden.pages[0])
        .into_iter()
        .find(|b| b.lines.iter().any(|l| l.text.contains("小計")))
        .expect("the group label block");
    assert_eq!(group_block.opacity, 0.0);
}

#[test]
fn an_absent_or_false_visually_hidden_renders_exactly_as_before() {
    // The append-only promise: every existing template is byte-identical.
    let (base, _) = labelled_table("");
    let (explicit_false, _) = labelled_table("        header:\n          visuallyHidden: false\n");
    assert_eq!(
        format!("{:?}", base.pages[0]),
        format!("{:?}", explicit_false.pages[0])
    );
}
