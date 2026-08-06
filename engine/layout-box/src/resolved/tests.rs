//! Unit tests for `ResolvedBox`.

use super::*;

fn parse_box(yaml: &str) -> OptBox {
    serde_yaml::from_str(yaml).expect("opt box")
}

fn resolve(yaml: &str, basis: &Basis) -> (ResolvedBox, Diagnostics) {
    let mut d = Diagnostics::new();
    let rb = ResolvedBox::resolve(&parse_box(yaml), basis, &mut d);
    (rb, d)
}

const BASIS: Basis = Basis {
    x: 100.0,
    w: 300.0,
    h: Some(500.0),
    font: shojiku_core::FontRel {
        em: 10.0,
        rem: 10.0,
    },
    pct_w: None,
    fill_h: None,
};

#[test]
fn empty_box_fills_the_parent() {
    let (rb, d) = resolve("{}", &BASIS);
    assert!(d.is_empty(), "diagnostics: {d:?}");
    assert_eq!(rb.x, 100.0);
    assert_eq!((rb.w, rb.h), (None, None));
    assert_eq!(rb.w_or_fill(&BASIS, 1.0), 300.0);
    assert_eq!((rb.margin, rb.padding), ([0.0; 4], [0.0; 4]));
}

#[test]
fn x_offset_and_left_margin_shift_the_border_box() {
    let (rb, d) = resolve("{ x: 20, margin: { left: 7 } }", &BASIS);
    assert!(d.is_empty(), "diagnostics: {d:?}");
    assert_eq!(rb.x, 127.0);
    // Fill width loses the offset, both horizontal margins included.
    let (rb, _) = resolve("{ x: 20, margin: { left: 7, right: 3 } }", &BASIS);
    assert_eq!(rb.w_or_fill(&BASIS, 1.0), 270.0);
}

#[test]
fn authored_width_and_height_win_over_fill() {
    let (rb, d) = resolve("{ w: \"50%\", h: \"10%\" }", &BASIS);
    assert!(d.is_empty(), "diagnostics: {d:?}");
    assert_eq!(rb.w, Some(150.0));
    assert_eq!(rb.h, Some(50.0));
    assert_eq!(rb.w_or_fill(&BASIS, 1.0), 150.0);
}

#[test]
fn fill_width_is_floored_at_min() {
    let (rb, _) = resolve("{ x: 290, margin: { right: 20 } }", &BASIS);
    // 300 - 290 - 20 < 0: text-ish contexts floor at 1, cells at 0.
    assert_eq!(rb.w_or_fill(&BASIS, 1.0), 1.0);
    assert_eq!(rb.w_or_fill(&BASIS, 0.0), 0.0);
}

#[test]
fn content_box_insets_by_padding_and_clamps() {
    let (rb, d) = resolve(
        "{ padding: { top: 5, right: 8, bottom: 3, left: 2 } }",
        &BASIS,
    );
    assert!(d.is_empty(), "diagnostics: {d:?}");
    assert_eq!(rb.content_x(), 102.0);
    assert_eq!(rb.content_w(100.0), 90.0);
    assert_eq!(rb.content_h(50.0), 42.0);
    assert_eq!(rb.v_padding(), 8.0);
    // Padding wider than the box clamps at zero, never negative.
    assert_eq!(rb.content_w(5.0), 0.0);
    assert_eq!(rb.content_h(4.0), 0.0);
}

#[test]
fn hostile_parts_fall_back_with_diagnostics() {
    // 400000% of the 300pt basis = 1.2e6pt, past the ±1e6 cap.
    let (rb, d) = resolve(
        "{ x: \"400000%\", w: \"500000%\", margin: { top: \"600000%\" } }",
        &BASIS,
    );
    assert_eq!(
        d.iter().filter(|x| x.code == "length_out_of_range").count(),
        3
    );
    // Offsets/margins drop to 0, the width to unset (fill).
    assert_eq!(rb.x, 100.0);
    assert_eq!(rb.w, None);
    assert_eq!(rb.margin[0], 0.0);
}

#[test]
fn min_max_clamp_authored_width_and_height_at_resolve() {
    // maxWidth cuts a 50% (150pt) width to 120; minHeight lifts a 10%
    // (50pt) height to 80.
    let (rb, d) = resolve(
        "{ w: \"50%\", h: \"10%\", maxWidth: 120, minHeight: 80 }",
        &BASIS,
    );
    assert!(d.is_empty(), "diagnostics: {d:?}");
    assert_eq!(rb.w, Some(120.0));
    assert_eq!(rb.h, Some(80.0));
    assert_eq!(rb.w_or_fill(&BASIS, 1.0), 120.0);
}

#[test]
fn min_max_clamp_the_fill_width_too() {
    // No authored width: the fill (300pt) is capped by maxWidth 200.
    let (rb, d) = resolve("{ maxWidth: 200 }", &BASIS);
    assert!(d.is_empty(), "diagnostics: {d:?}");
    assert_eq!(rb.w, None);
    assert_eq!(rb.w_or_fill(&BASIS, 1.0), 200.0);
    // minWidth floors a short fill.
    let (rb, _) = resolve("{ x: 250, minWidth: 100 }", &BASIS);
    assert_eq!(rb.w_or_fill(&BASIS, 1.0), 100.0);
}

#[test]
fn clamp_h_bounds_an_auto_height() {
    let (rb, _) = resolve("{ minHeight: 40, maxHeight: 90 }", &BASIS);
    assert_eq!(rb.clamp_h(20.0), 40.0);
    assert_eq!(rb.clamp_h(120.0), 90.0);
    assert_eq!(rb.clamp_h(60.0), 60.0);
    assert_eq!(rb.h_bounds(), (Some(40.0), Some(90.0)));
    // Unset bounds: clamp is a no-op and the accessor reports None.
    let (rb, _) = resolve("{}", &BASIS);
    assert_eq!(rb.clamp_h(60.0), 60.0);
    assert_eq!(rb.h_bounds(), (None, None));
}

#[test]
fn percent_min_height_against_auto_parent_drops() {
    let auto = Basis {
        x: 0.0,
        w: 300.0,
        h: None,
        font: shojiku_core::FontRel::default(),
        pct_w: None,
        fill_h: None,
    };
    let (rb, d) = resolve("{ minHeight: \"50%\" }", &auto);
    assert!(d.iter().any(|x| x.code == "percent_of_auto"));
    // The dropped bound leaves the auto height untouched.
    assert_eq!(rb.clamp_h(60.0), 60.0);
}

#[test]
fn auto_margin_sides_flag_and_resolve_to_zero() {
    let (rb, d) = resolve("{ w: 100, margin: { left: auto, top: 5 } }", &BASIS);
    assert!(d.is_empty(), "diagnostics: {d:?}");
    assert_eq!(rb.margin_auto, [false, false, false, true]);
    // The auto side contributes 0 pt here; flex distributes it later.
    assert_eq!(rb.margin, [5.0, 0.0, 0.0, 0.0]);
    assert_eq!(rb.x, 100.0);

    let (rb, _) = resolve("{}", &BASIS);
    assert_eq!(rb.margin_auto, [false; 4]);
}
