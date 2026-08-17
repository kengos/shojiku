//! `ellipse: { anchor: <id> }` — the form annotation that circles another
//! item. It centres on the target's INKED band (its text metrics), which
//! is why a circled word is not also circling the leading and padding.

use crate::common::*;
use shojiku_image::PathCmd;

/// The one path on a page, as its bounding `(x, y, w, h)`.
fn only_oval(page: &LayoutPage) -> (f64, f64, f64, f64) {
    let paths: Vec<_> = page
        .items
        .iter()
        .filter_map(|i| match i {
            LayoutItem::Path(p) => Some(p),
            _ => None,
        })
        .collect();
    assert_eq!(paths.len(), 1, "expected exactly one path");
    let pts: Vec<(f64, f64)> = paths[0]
        .cmds
        .iter()
        .flat_map(|c| match c {
            PathCmd::MoveTo(x, y) | PathCmd::LineTo(x, y) => vec![(*x, *y)],
            PathCmd::CurveTo(a, b, c, d, e, f) => vec![(*a, *b), (*c, *d), (*e, *f)],
            PathCmd::Close => vec![],
        })
        .collect();
    let xs: Vec<f64> = pts.iter().map(|p| p.0).collect();
    let ys: Vec<f64> = pts.iter().map(|p| p.1).collect();
    let (x0, x1) = (min(&xs), max(&xs));
    let (y0, y1) = (min(&ys), max(&ys));
    (x0, y0, x1 - x0, y1 - y0)
}

fn min(v: &[f64]) -> f64 {
    v.iter().copied().fold(f64::INFINITY, f64::min)
}

fn max(v: &[f64]) -> f64 {
    v.iter().copied().fold(f64::NEG_INFINITY, f64::max)
}

/// [`circled`] keeping the box index, for the cases that derive the
/// expected oval from the target's own text metrics.
fn with_answer_full(extra: &str, writing_mode: &str) -> LayoutOutput {
    run_full(
        &format!(
            "page: {{ size: {{ w: 300, h: 300 }}, margin: 0 }}\n\
             sections:\n  body:\n    type: absolute\n    items:\n      \
             - {{ type: text, id: answer, text: \"AB\", \
             box: {{ x: 20, y: 40, w: 120, h: 60 }}, \
             style: {{ fontSize: 20{writing_mode} }} }}\n      \
             - {{ type: ellipse, anchor: answer{extra} }}\n"
        ),
        json!({}),
    )
}

/// A text item with `id: answer` plus an ellipse anchored to it.
fn circled(extra: &str, writing_mode: &str) -> (LayoutDocument, Diagnostics) {
    run(
        &format!(
            "page: {{ size: {{ w: 300, h: 300 }}, margin: 0 }}\n\
             sections:\n  body:\n    type: absolute\n    items:\n      \
             - {{ type: text, id: answer, text: \"AB\", \
             box: {{ x: 20, y: 40, w: 120, h: 60 }}, \
             style: {{ fontSize: 20{writing_mode} }} }}\n      \
             - {{ type: ellipse, anchor: answer{extra} }}\n"
        ),
        json!({}),
    )
}

#[test]
fn an_anchored_ellipse_takes_the_glyph_band_plus_clearance() {
    // Read the target's OWN metrics and derive what the oval must be, so
    // this pins the rule rather than a font's numbers: the inked band,
    // inflated by 0.4 of its height on every side. An oval on the band's
    // exact extent is widest at mid-height and crosses the glyphs — which
    // is the strikethrough the text `mark:` overlay pads to avoid.
    let out = with_answer_full("", "");
    let target = out.boxes.pages[0]
        .iter()
        .find(|b| b.id.as_deref() == Some("answer"))
        .expect("the text reports a placement");
    let lines = target
        .text
        .as_ref()
        .expect("text metrics")
        .lines()
        .expect("horizontal");
    let band_x = lines.iter().map(|l| l.x).fold(f64::INFINITY, f64::min);
    let band_r = lines
        .iter()
        .map(|l| l.x + l.width)
        .fold(f64::NEG_INFINITY, f64::max);
    let band_t = lines.iter().map(|l| l.em_top).fold(f64::INFINITY, f64::min);
    let band_b = lines
        .iter()
        .map(|l| l.em_bottom)
        .fold(f64::NEG_INFINITY, f64::max);
    let pad = (band_b - band_t) * 0.4;

    let (x, y, w, h) = only_oval(&out.document.pages[0]);
    assert!((x - (band_x - pad)).abs() < 1e-6, "x {x}");
    assert!((y - (band_t - pad)).abs() < 1e-6, "y {y}");
    assert!((w - (band_r - band_x + pad * 2.0)).abs() < 1e-6, "w {w}");
    assert!((h - (band_b - band_t + pad * 2.0)).abs() < 1e-6, "h {h}");
    // …and the clearance is real, not zero.
    assert!(pad > 0.0, "no clearance");
}

#[test]
fn an_authored_size_centres_on_the_band_instead_of_replacing_it() {
    let (bare, _) = circled("", "");
    let (bx, by, bw, bh) = only_oval(&bare.pages[0]);
    let (sized, _) = circled(", box: { w: 80, h: 30 }", "");
    let (x, y, w, h) = only_oval(&sized.pages[0]);
    assert_eq!((w, h), (80.0, 30.0), "the authored size must win");
    // Same centre as the band it circles.
    assert!(
        (x + w / 2.0 - (bx + bw / 2.0)).abs() < 1e-9,
        "x centre moved"
    );
    assert!(
        (y + h / 2.0 - (by + bh / 2.0)).abs() < 1e-9,
        "y centre moved"
    );
}

#[test]
fn a_vertical_target_is_read_from_its_column_metrics() {
    // Japanese, because Latin in a vertical run is upright and one glyph
    // tall — the column-metric arm is what this case is about, and two
    // full-width glyphs make the band unambiguously taller than wide.
    let (doc, diags) = run(
        r#"
page: { size: { w: 300, h: 300 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        id: answer
        text: "あい"
        box: { x: 20, y: 40, w: 120, h: 60 }
        style: { fontSize: 20, writingMode: vertical_rl, fontFamily: biz-ud-gothic }
      - { type: ellipse, anchor: answer }
"#,
        json!({}),
    );
    let (x, y, w, h) = only_oval(&doc.pages[0]);
    assert!(diags.is_empty(), "{diags:?}");
    // Vertical text inks a tall, narrow band: the column run is taller
    // than one em is wide. Read from `TextMetrics::Columns`, which is a
    // different arm from the horizontal case above.
    assert!(h > w, "expected a tall band, got {w}×{h}");
    // Clearance pushes the oval above the column's top, outside the box.
    // The x side stays inside it: a `vertical_rl` run inks at the RIGHT
    // edge of its box, so there is 80pt of empty box to its left.
    assert!(y < 40.0, "no vertical clearance at y={y}");
    assert!(x > 20.0, "the column inks at the right edge, got x={x}");
}

#[test]
fn a_target_with_no_text_falls_back_to_its_border_box_plus_clearance() {
    let (doc, diags) = run(
        r#"
page: { size: { w: 300, h: 300 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - { type: rect, id: cell, box: { x: 20, y: 40, w: 100, h: 50 }, style: { borderWidth: 1 } }
      - { type: ellipse, anchor: cell }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "{diags:?}");
    // Border box 100x50 at (20, 40); clearance is 0.4 of its height.
    assert_eq!(only_oval(&doc.pages[0]), (0.0, 20.0, 140.0, 90.0));
}

#[test]
fn an_unknown_target_draws_nothing_and_warns() {
    let (doc, diags) = circled("", "");
    assert!(!doc.pages[0].items.is_empty(), "the fixture draws");
    let (doc, diags2) = run(
        r#"
page: { size: { w: 300, h: 300 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - { type: ellipse, anchor: nope }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "{diags:?}");
    assert!(doc.pages[0].items.is_empty(), "must draw nothing");
    let d = diags2
        .iter()
        .find(|d| d.code == "anchor_unknown_target")
        .expect("must warn");
    assert!(d.message.contains("nope"), "{d:?}");
}

#[test]
fn an_unanchored_ellipse_is_unchanged() {
    // The regression clause: every committed template authors this shape.
    let (doc, diags) = run(
        r#"
page: { size: { w: 300, h: 300 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - { type: ellipse, box: { x: 10, y: 10, w: 40, h: 20 } }
"#,
        json!({}),
    );
    assert!(diags.is_empty(), "{diags:?}");
    assert_eq!(only_oval(&doc.pages[0]), (10.0, 10.0, 40.0, 20.0));
}

#[test]
fn a_presence_binding_still_decides_whether_it_paints() {
    let (doc, _) = circled(", data: { key: mark }", "");
    assert!(
        doc.pages[0]
            .items
            .iter()
            .all(|i| !matches!(i, LayoutItem::Path(_))),
        "an unmatched binding must not paint the oval"
    );
    let out = run_full(
        r#"
page: { size: { w: 300, h: 300 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - { type: text, id: answer, text: "AB", box: { x: 20, y: 40, w: 120, h: 60 }, style: { fontSize: 20 } }
      - { type: ellipse, id: ring, anchor: answer, data: { key: mark } }
"#,
        json!({ "mark": false }),
    );
    // …and the placement is still reported, so a Designer can show where
    // the mark would sit.
    assert!(out.boxes.pages[0]
        .iter()
        .any(|b| b.id.as_deref() == Some("ring")));
}

#[test]
fn an_unanchored_unsized_ellipse_still_warns_rather_than_guessing() {
    // The shape the wire widening newly ADMITS: `box` is optional now, so
    // this parses where it used to be a parse error. Layout must still
    // refuse it, and say so.
    let (doc, diags) = run(
        "page: { size: { w: 100, h: 100 }, margin: 0 }\n\
         sections:\n  body:\n    type: absolute\n    items:\n      \
         - { type: ellipse }\n",
        json!({}),
    );
    assert!(doc.pages[0].items.is_empty(), "nothing drawn");
    assert!(
        diags.iter().any(|d| d.code == "mark_missing_size"),
        "{diags:?}"
    );
}
