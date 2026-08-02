//! Table outer frame: the per-side map form of the table's
//! `borderWidth` framing each page fragment, with the inner grid kept
//! at its default; double rules on the frame.

use crate::common::*;

use super::style::styled_table;

#[test]
fn per_side_table_border_draws_an_outer_frame_over_the_default_grid() {
    // The map form frames the table per side; the inner grid keeps
    // the 0.5pt default.
    let (doc, diags) = styled_table(
        "        style: { borderWidth: { top: 2, bottom: 2 }, borderColor: \"#ff0000\" }\n",
        2,
    );
    assert!(diags.is_empty(), "diags: {:?}", diags);
    let rects = rect_shapes(&doc.pages[0]);
    // 2 row outlines (default 0.5 grid) + 2 frame bands (top, bottom).
    let outlines: Vec<_> = rects.iter().filter(|r| r.stroke_width == 0.5).collect();
    assert_eq!(outlines.len(), 2);
    let bands: Vec<_> = rects
        .iter()
        .filter(|r| r.stroke.is_none() && r.fill == Some((1.0, 0.0, 0.0)))
        .collect();
    assert_eq!(bands.len(), 2);
    // Frame bands are 2pt thick and centered on the table's top/bottom.
    assert_eq!(bands[0].h, 2.0);
    assert_eq!(bands[0].y, -1.0);
    let table_bottom = outlines[0].h + outlines[1].h;
    assert_eq!(bands[1].y, table_bottom - 1.0);
}

#[test]
fn table_outer_frame_wraps_every_page_fragment() {
    // A paginating table draws the frame around each page's fragment.
    let (doc, _) = styled_table(
        "        style: { borderWidth: { left: 3 } }\n        row: { height: 100 }\n",
        9,
    );
    assert_eq!(doc.pages.len(), 2);
    for page in &doc.pages {
        let frame: Vec<_> = rect_shapes(page)
            .into_iter()
            .filter(|r| r.stroke.is_none() && r.fill.is_some() && r.w == 3.0)
            .collect();
        assert_eq!(frame.len(), 1, "one left frame band per fragment");
    }
}

#[test]
fn double_outer_frame_splits_into_stripes() {
    let (doc, _) = styled_table(
        "        style: { borderWidth: { top: 3 }, borderStyle: { top: double } }\n",
        1,
    );
    let stripes: Vec<_> = rect_shapes(&doc.pages[0])
        .into_iter()
        .filter(|r| r.stroke.is_none() && r.fill.is_some() && r.h == 1.0)
        .collect();
    assert_eq!(stripes.len(), 2);
}
