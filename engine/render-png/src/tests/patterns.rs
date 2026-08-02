//! Dashed strokes and rounded corners on the PNG backend: the pixels a
//! human would check — gaps really are unpainted, and a rounded corner
//! really is empty while the edge beside it is inked.

use super::vertical::ink_in;
use super::*;

/// A 200×120pt page carrying one absolutely-placed box with `style`.
fn boxed(style: &str) -> Vec<Vec<u8>> {
    render(
        &format!(
            r#"
page: {{ size: {{ w: 200, h: 120 }}, margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: rect
        box: {{ x: 20, y: 20, w: 160, h: 80 }}
        style: {style}
"#
        ),
        json!({}),
    )
}

#[test]
fn a_dashed_border_leaves_unpainted_gaps_along_the_edge() {
    // The whole point of a dash is the gaps, and only pixels prove them:
    // a solid border of the same width inks strictly more of the edge.
    let solid = boxed("{ borderWidth: 3, borderColor: \"#000000\" }");
    let dashed = boxed("{ borderWidth: 3, borderColor: \"#000000\", borderStyle: dashed }");
    let (w, _, solid_px) = decode(&solid[0]);
    let (_, _, dashed_px) = decode(&dashed[0]);
    // A band across the top edge, away from the corners.
    let band = |rgba: &[u8]| ink_in(rgba, w, 40, 36, 320, 46);
    let solid_ink = band(&solid_px);
    let dashed_ink = band(&dashed_px);
    assert!(solid_ink > 0, "the solid control must ink the top edge");
    assert!(
        dashed_ink > 0,
        "a dashed border still paints its `on` intervals"
    );
    assert!(
        dashed_ink * 2 < solid_ink * 3 / 2,
        "dashed inked {dashed_ink} of the {solid_ink} a solid edge does — expected roughly half"
    );
}

#[test]
fn a_dotted_border_leaves_more_gaps_than_a_dashed_one_of_equal_width() {
    // Same duty cycle but a shorter period, so at a fixed sample band the
    // dotted edge alternates more often; both must still paint.
    let dashed = boxed("{ borderWidth: 3, borderColor: \"#000000\", borderStyle: dashed }");
    let dotted = boxed("{ borderWidth: 3, borderColor: \"#000000\", borderStyle: dotted }");
    let (w, _, dashed_px) = decode(&dashed[0]);
    let (_, _, dotted_px) = decode(&dotted[0]);
    let transitions = |rgba: &[u8]| {
        let y = 41;
        let mut count = 0;
        let mut prev = false;
        for x in 40..320 {
            let inked = pixel(rgba, w, x, y)[0] < 80;
            if inked != prev {
                count += 1;
            }
            prev = inked;
        }
        count
    };
    let (d_dashed, d_dotted) = (transitions(&dashed_px), transitions(&dotted_px));
    assert!(d_dashed > 0 && d_dotted > 0, "both patterns must alternate");
    assert!(
        d_dotted > d_dashed,
        "dotted ({d_dotted}) should alternate more often than dashed ({d_dashed})"
    );
}

#[test]
fn a_rounded_corner_is_empty_while_the_edge_beside_it_is_inked() {
    // The perceptual claim of `borderRadius`, checked as pixels: the very
    // corner of the border box has no stroke, but the middle of the top
    // edge does.
    let rounded = boxed("{ borderWidth: 3, borderColor: \"#000000\", borderRadius: 20 }");
    let (w, _, px) = decode(&rounded[0]);
    // Box border box is (20,20)-(180,100)pt; the default preview scale is
    // 2 px/pt, so the top-left corner sits at (40, 40) px.
    let corner = ink_in(&px, w, 40, 40, 50, 50);
    let mid_top = ink_in(&px, w, 190, 36, 210, 46);
    assert_eq!(corner, 0, "a 20pt radius must clear the square corner");
    assert!(mid_top > 0, "the straight run of the top edge still inks");
}

#[test]
fn a_square_box_of_the_same_style_does_ink_that_corner() {
    // The control for the test above — proves the empty corner is the
    // radius, not a sampling mistake.
    let square = boxed("{ borderWidth: 3, borderColor: \"#000000\" }");
    let (w, _, px) = decode(&square[0]);
    assert!(ink_in(&px, w, 40, 40, 50, 50) > 0);
}

#[test]
fn a_rounded_fill_without_a_border_also_clears_the_corner() {
    // The fill follows the same path as the stroke, so a bare
    // backgroundColor rounds too.
    let filled = boxed("{ backgroundColor: \"#000000\", borderRadius: 20 }");
    let (w, _, px) = decode(&filled[0]);
    assert_eq!(ink_in(&px, w, 40, 40, 48, 48), 0);
    assert!(ink_in(&px, w, 190, 60, 210, 80) > 0, "the middle is filled");
}

#[test]
fn a_rounded_clip_hides_a_child_pixel_outside_the_corner() {
    // `overflow: hidden` on a rounded box must clip along the CURVE: a child
    // that fills the whole box paints the edge midline but not the square
    // corner the radius cut away.
    let pages = render(
        r##"
page: { size: { w: 200, h: 120 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: container
        box: { x: 20, y: 20, w: 160, h: 80 }
        style: { borderRadius: 20, overflow: hidden }
        items:
          - type: rect
            box: { x: 0, y: 0, w: 160, h: 80 }
            style: { backgroundColor: "#000000" }
"##,
        json!({}),
    );
    let (w, _, px) = decode(&pages[0]);
    assert_eq!(
        ink_in(&px, w, 40, 40, 48, 48),
        0,
        "the corner outside the rounded clip stays white"
    );
    assert!(
        ink_in(&px, w, 190, 60, 210, 80) > 0,
        "the middle still paints"
    );
}
