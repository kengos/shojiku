//! `header.visuallyHidden` end to end: the row paints nothing while its
//! labels stay in the text layer, it keeps its height, its spanning
//! group row hides with it, and its cell placements say so in the box
//! index (`PlacedBox.hidden`), which is what lets a Designer ghost the
//! strip instead of drawing nothing there.
//!
//! Split from `style.rs`, which sits near the 300-line budget.

use crate::common::*;
use shojiku_layout::PlacedBox;

/// A one-column table with a label, plus whatever `header:`/`headerGroups:`
/// block the caller wants above the columns, in a `region_h`-tall region.
fn template(extra: &str, region_h: f64) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 0, y: 0, w: 400, h: {region_h} }}
    items:
      - type: table
        data: {{ key: items }}
{extra}        columns:
          - label: 名前
            data: {{ key: n }}
            width: 100
"#
    )
}

fn labelled_table(extra: &str) -> (LayoutDocument, Diagnostics) {
    run(&template(extra, 600.0), json!({ "items": [ {"n": 1} ] }))
}

/// The same fixture with the box index attached, over `rows` data rows in
/// a `region_h`-tall region (small enough and it paginates).
fn labelled_output(extra: &str, region_h: f64, rows: usize) -> LayoutOutput {
    let items: Vec<Value> = (1..=rows).map(|i| json!({ "n": i })).collect();
    run_full(&template(extra, region_h), json!({ "items": items }))
}

/// Every placement on `page` whose path names the one authored column, in
/// emission order — the header row's cell first, then one per data row.
fn column_boxes(out: &LayoutOutput, page: usize) -> Vec<&PlacedBox> {
    out.boxes.pages[page]
        .iter()
        .filter(|b| b.path.ends_with(".columns[0]"))
        .collect()
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

#[test]
fn a_visually_hidden_headers_cell_boxes_are_stamped_hidden() {
    let hidden = labelled_output(HIDDEN, 600.0, 2);
    // Positive control on the same fixture: with the key absent NOTHING is
    // stamped, so a `true` below is the key's doing and not the table's.
    let shown = labelled_output("", 600.0, 2);
    assert!(shown.boxes.pages[0].iter().all(|b| !b.hidden));

    // The header row's cell is stamped; the two data rows' cells are not.
    // All three share the column's structural path — the flag is the only
    // thing that separates the label row from the data it labels.
    assert_eq!(
        column_boxes(&hidden, 0)
            .iter()
            .map(|b| b.hidden)
            .collect::<Vec<_>>(),
        vec![true, false, false]
    );
    // The geometry is real: the ghost is drawn WHERE the header sits, which
    // is the whole reason the placement is reported rather than dropped.
    let header = column_boxes(&hidden, 0)[0];
    assert_eq!((header.border.w, header.border.x), (100.0, 0.0));
    assert!(header.border.h > 0.0);
}

#[test]
fn a_hidden_headers_group_row_cells_are_stamped_too() {
    // The group row rides the same `row_atom` path, so it would be the
    // silent omission if the flag were threaded at the label row only.
    let groups = "        headerGroups:\n          - { label: 小計, span: 1 }\n";
    let out = labelled_output(&format!("{groups}{HIDDEN}"), 600.0, 1);
    let group: Vec<&PlacedBox> = out.boxes.pages[0]
        .iter()
        .filter(|b| b.path.ends_with(".headerGroups[0]"))
        .collect();
    assert_eq!(group.len(), 1, "one placement per authored group");
    assert!(group[0].hidden);
    // …and the group row above a SHOWN header stays unstamped.
    let shown = labelled_output(groups, 600.0, 1);
    assert!(shown.boxes.pages[0].iter().all(|b| !b.hidden));
}

#[test]
fn a_repeated_hidden_header_is_stamped_on_every_page() {
    // `repeatHeader` defaults true, so the header is redrawn on page 2 —
    // and a Designer ghosting only page 1 would be drawing the strip on one
    // page and nothing on the next.
    let out = labelled_output(HIDDEN, 100.0, 8);
    assert!(out.boxes.pages.len() > 1, "the fixture must paginate");
    for page in 0..out.boxes.pages.len() {
        let cells = column_boxes(&out, page);
        assert!(!cells.is_empty(), "page {page} places the column");
        assert!(cells[0].hidden, "page {page}'s repeated header");
        assert!(
            cells[1..].iter().all(|b| !b.hidden),
            "page {page}'s data rows"
        );
    }
}

#[test]
fn an_ordinary_headers_placements_serialize_no_hidden_key() {
    // The wire is byte-unchanged for every document that authors neither
    // `visible:` nor `visuallyHidden:` — `hidden` is skipped when false, so
    // the key must not appear at all rather than appear as `false`.
    let out = labelled_output("", 600.0, 2);
    let json = serde_json::to_string(&out.boxes).expect("serialize");
    assert!(!json.contains("hidden"), "json: {json}");
    // Positive control: the SAME serialization does carry the key once the
    // header is hidden, so the assertion above is not passing on an empty
    // index or a renamed field.
    let hidden = labelled_output(HIDDEN, 600.0, 2);
    let json = serde_json::to_string(&hidden.boxes).expect("serialize");
    assert!(json.contains("\"hidden\":true"), "json: {json}");
}
