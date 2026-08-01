//! Text-anchored 丸囲み (`mark:` on a text item): the overlay draws over
//! the glyph band, its presence never moves the text (blank↔filled
//! invariant), and it rides the same translate paths as the block.

use super::flow;
use crate::common::*;
use shojiku_image::PathCmd;

/// Bounding box `(min_x, min_y, max_x, max_y)` of a path's control points —
/// an over-estimate of the oval's extent, enough to locate its center.
fn bbox(cmds: &[PathCmd]) -> (f64, f64, f64, f64) {
    let mut pts = Vec::new();
    for cmd in cmds {
        match *cmd {
            PathCmd::MoveTo(x, y) | PathCmd::LineTo(x, y) => pts.push((x, y)),
            PathCmd::CurveTo(x1, y1, x2, y2, x, y) => {
                pts.extend([(x1, y1), (x2, y2), (x, y)]);
            }
            PathCmd::Close => {}
        }
    }
    let min_x = pts.iter().map(|p| p.0).fold(f64::MAX, f64::min);
    let min_y = pts.iter().map(|p| p.1).fold(f64::MAX, f64::min);
    let max_x = pts.iter().map(|p| p.0).fold(f64::MIN, f64::max);
    let max_y = pts.iter().map(|p| p.1).fold(f64::MIN, f64::max);
    (min_x, min_y, max_x, max_y)
}

/// A single 12pt fixed-pitch label absolutely placed at (40, 40) in a
/// 40pt-tall box, with a `mark:` body — absolute so `box.y` is honored and
/// the glyph band lands at a known position.
fn labelled(mark: &str) -> String {
    format!(
        r"
page: {{ size: A4, margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: text
        box: {{ x: 40, y: 40, w: 60, h: 40 }}
        style: {{ fontSize: 12, lineHeight: 1, verticalAlign: top, fontFamily: biz-ud-gothic }}
        text: 現金
        mark: {{ {mark} }}
"
    )
}

#[test]
fn decoration_mark_draws_an_oval_over_the_glyph_band() {
    let (doc, diags) = run(
        &labelled("style: { borderColor: \"#cc0000\", backgroundColor: \"#ffeeee\" }"),
        json!({}),
    );
    assert!(diags.is_empty(), "{diags:?}");
    // The text block is still there; the oval is an extra Path.
    assert_eq!(text_blocks(&doc.pages[0]).len(), 1);
    let paths = path_shapes(&doc.pages[0]);
    assert_eq!(paths.len(), 1);
    assert_eq!(paths[0].stroke, Some((0.8, 0.0, 0.0)));
    assert!(paths[0].fill.is_some(), "backgroundColor honored");
    // The oval centers on the glyph band (top-aligned, near y = 40..53),
    // NOT the 40pt-tall box's center (y = 60) — the whole point of the
    // feature. It rides the glyphs.
    let (_, min_y, _, max_y) = bbox(&paths[0].cmds);
    let center_y = (min_y + max_y) / 2.0;
    assert!(
        center_y > 40.0,
        "oval center {center_y} should sit at/below the box top"
    );
    assert!(
        center_y < 55.0,
        "oval center {center_y} should ride the glyphs, not box center 60"
    );
}

#[test]
fn presence_never_shifts_the_text_between_params() {
    let items = labelled("data: { key: pay, equals: cash }");
    let (matched, _) = run(&items, json!({ "pay": "cash" }));
    let (missed, _) = run(&items, json!({ "pay": "card" }));
    // The oval draws only on the match…
    assert_eq!(path_shapes(&matched.pages[0]).len(), 1);
    assert_eq!(path_shapes(&missed.pages[0]).len(), 0);
    // …but the text block is byte-identical either way (paint-only overlay).
    let a = &text_blocks(&matched.pages[0])[0].lines[0];
    let b = &text_blocks(&missed.pages[0])[0].lines[0];
    assert_eq!((a.x, a.y, a.width), (b.x, b.y, b.width));
}

#[test]
fn padding_widens_the_oval_symmetrically() {
    let (tight, _) = run(&labelled("padding: 0"), json!({}));
    let (loose, _) = run(&labelled("padding: 6"), json!({}));
    let t = bbox(&path_shapes(&tight.pages[0])[0].cmds);
    let l = bbox(&path_shapes(&loose.pages[0])[0].cmds);
    // 6pt of extra clearance grows the box ~6pt on each side; the centers
    // stay put.
    assert!((((t.0 + t.2) / 2.0) - ((l.0 + l.2) / 2.0)).abs() < 1e-6);
    assert!(l.0 < t.0 - 5.0 && l.2 > t.2 + 5.0, "wider: {l:?} vs {t:?}");
}

#[test]
fn a_hostile_negative_padding_clamps_the_oval_without_inverting() {
    // A large negative clearance would collapse or flip the box; it clamps
    // to a tiny positive oval instead (still drawn, still centered).
    let (doc, diags) = run(&labelled("padding: -100"), json!({}));
    assert!(diags.is_empty(), "{diags:?}");
    let (x0, y0, x1, y1) = bbox(&path_shapes(&doc.pages[0])[0].cmds);
    assert!(
        x1 > x0 && y1 > y0,
        "oval stays positive: {:?}",
        (x0, y0, x1, y1)
    );
    assert!(
        (x1 - x0) < 3.0 && (y1 - y0) < 3.0,
        "clamped small: {:?}",
        (x1 - x0, y1 - y0)
    );
}

#[test]
fn a_hostile_huge_padding_degrades_to_the_default_clearance() {
    // `padding` bypasses the box-resolution guards; an over-MAX_RESOLVED_PT
    // value degrades to the em default instead of carrying ±inf into the
    // render boundary. The result matches a padding-less oval.
    let (huge, diags) = run(&labelled("padding: 9.9e300"), json!({}));
    assert!(diags.is_empty(), "{diags:?}");
    let (plain, _) = run(&labelled(""), json!({}));
    let h = bbox(&path_shapes(&huge.pages[0])[0].cmds);
    let p = bbox(&path_shapes(&plain.pages[0])[0].cmds);
    // Every coordinate is finite, and the box equals the default-clearance
    // oval (the two differ only in stroke color).
    assert!(
        [h.0, h.1, h.2, h.3].iter().all(|v| v.is_finite()),
        "finite: {h:?}"
    );
    assert!(
        (h.2 - h.0 - (p.2 - p.0)).abs() < 1e-6,
        "default width: {h:?} vs {p:?}"
    );
}

#[test]
fn mark_reaches_a_clipped_block_under_a_decoration() {
    // textOverflow: clip wraps the block in a Clip node, and a
    // backgroundColor paints a decoration rect before it — the overlay
    // still finds the block through both.
    let items = flow(
        r##"      - type: text
        box: { x: 40, y: 40, w: 30, h: 16 }
        style: { fontSize: 12, textOverflow: clip, backgroundColor: "#eeeeee", fontFamily: biz-ud-gothic }
        text: 現金領収書控
        mark: { style: { borderColor: "#cc0000" } }
"##,
    );
    let (doc, diags) = run(&items, json!({}));
    assert!(diags.is_empty(), "{diags:?}");
    // One oval path is emitted even though the text lives inside a clip.
    assert_eq!(path_shapes(&doc.pages[0]).len(), 1);
}

#[test]
fn mark_overlays_a_rich_spans_block() {
    // The rich (spans) path shares one layout-computed baseline across
    // mixed sizes; the overlay keys off it (block.baseline is Some), so
    // the oval still rides the glyphs of a spans block.
    let items = r##"
page: { size: A4, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 40, y: 40, w: 200 }
        mark: { style: { borderColor: "#cc0000" } }
        spans:
          - { text: 現金, style: { fontSize: 14, fontFamily: biz-ud-gothic } }
          - { text: カード, style: { fontSize: 10, fontFamily: biz-ud-gothic } }
"##;
    let (doc, diags) = run(items, json!({}));
    assert!(diags.is_empty(), "{diags:?}");
    let paths = path_shapes(&doc.pages[0]);
    assert_eq!(paths.len(), 1, "one oval over the rich block");
    // The oval spans both spans horizontally (現金 14pt + カード 10pt) and
    // centers on the shared baseline band just below the block top (box
    // y = 40), riding the glyphs rather than floating off them.
    let (x0, y0, x1, y1) = bbox(&paths[0].cmds);
    assert!(x1 - x0 > 40.0, "spans both fragments: {:?}", x1 - x0);
    let center_y = (y0 + y1) / 2.0;
    assert!(
        (42.0..56.0).contains(&center_y),
        "rides the glyph band: {center_y}"
    );
}

#[test]
fn mark_unions_the_band_across_wrapped_lines() {
    // A narrow box wraps the label into two lines; the oval spans both
    // (its band is the union), so it is taller than a single-line oval.
    let one = labelled("padding: 0");
    let two = flow(
        r"      - type: text
        box: { x: 40, y: 40, w: 24 }
        style: { fontSize: 12, fontFamily: biz-ud-gothic }
        text: 現金カード
        mark: { padding: 0 }
",
    );
    let (a, _) = run(&one, json!({}));
    let (b, _) = run(&two, json!({}));
    let single = bbox(&path_shapes(&a.pages[0])[0].cmds);
    let wrapped = bbox(&path_shapes(&b.pages[0])[0].cmds);
    assert!(
        (wrapped.3 - wrapped.1) > (single.3 - single.1) + 5.0,
        "two-line oval {wrapped:?} taller than one-line {single:?}"
    );
}

#[test]
fn empty_text_draws_no_oval() {
    // Nothing to circle — the band is empty, so no path is emitted.
    let items = flow(
        "      - type: text\n        box: { x: 40, y: 40, w: 60, h: 20 }\n        \
         text: \"\"\n        mark: {}\n",
    );
    let (doc, _) = run(&items, json!({}));
    assert_eq!(path_shapes(&doc.pages[0]).len(), 0);
}

#[test]
fn mark_rides_flex_and_repeat_placement() {
    // In a centered flex row the whole text atom is shifted with
    // translate_x; the oval must move with the glyphs. Two labels, so the
    // second is offset — its oval x-range must be shifted too.
    let row = flow(
        r"      - type: container
        box: { direction: row, gap: 40, justifyContent: center }
        items:
          - type: text
            style: { fontFamily: biz-ud-gothic }
            text: 現金
            mark: {}
          - type: text
            style: { fontFamily: biz-ud-gothic }
            text: カード
            mark: {}
",
    );
    let (doc, diags) = run(&row, json!({}));
    assert!(diags.is_empty(), "{diags:?}");
    let paths = path_shapes(&doc.pages[0]);
    assert_eq!(paths.len(), 2);
    let (a, b) = (bbox(&paths[0].cmds), bbox(&paths[1].cmds));
    assert!(b.0 > a.2, "second oval {b:?} sits right of the first {a:?}");
}

#[test]
fn mark_scopes_to_the_repeat_element() {
    let tpl = flow(
        r#"      - type: repeat
        data: { key: rows }
        grid: { columns: 1, rows: 3 }
        cell:
          items:
            - type: text
              style: { fontFamily: biz-ud-gothic }
              text: "{v}"
              mark: { data: { key: v, equals: "1" } }
"#,
    );
    let (doc, diags) = run(
        &tpl,
        json!({ "rows": [ { "v": "1" }, { "v": "2" }, { "v": "1" } ] }),
    );
    assert!(diags.is_empty(), "{diags:?}");
    // Elements 0 and 2 match "1" → two ovals across the imposition grid.
    assert_eq!(path_shapes(&doc.pages[0]).len(), 2);
}
