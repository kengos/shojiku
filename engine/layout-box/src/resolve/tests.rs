//! Unit tests for guarded length/edge resolution.

use super::*;
use shojiku_core::FontRel;

fn basis(w: f64, h: Option<f64>) -> Basis {
    Basis {
        x: 0.0,
        w,
        h,
        font: FontRel::default(),
        pct_w: None,
        fill_h: None,
    }
}

fn edges(yaml: &str) -> EdgeSpec {
    serde_yaml::from_str(yaml).expect("edge spec")
}

#[test]
fn resolve_x_handles_pt_percent_and_unset() {
    let mut d = Diagnostics::new();
    let b = basis(200.0, None);
    assert_eq!(resolve_x(Some(Length::Pt(15.0)), &b, &mut d), Some(15.0));
    assert_eq!(
        resolve_x(Some(Length::Percent(50.0)), &b, &mut d),
        Some(100.0)
    );
    assert_eq!(resolve_x(None, &b, &mut d), None);
    assert!(d.is_empty(), "diagnostics: {d:?}");
}

#[test]
fn out_of_range_lengths_are_dropped_with_a_diagnostic() {
    let mut d = Diagnostics::new();
    let b = basis(1000.0, None);
    // 200_000% of 1000pt = 2_000_000pt, past the ±1e6 cap.
    assert_eq!(
        resolve_x(Some(Length::Percent(200_000.0)), &b, &mut d),
        None
    );
    assert!(d.iter().any(|x| x.code == "length_out_of_range"));
}

#[test]
fn negative_lengths_within_range_pass_the_cap() {
    let mut d = Diagnostics::new();
    assert_eq!(
        resolve_x(Some(Length::Pt(-40.0)), &basis(100.0, None), &mut d),
        Some(-40.0)
    );
    assert!(d.is_empty(), "diagnostics: {d:?}");
}

#[test]
fn resolve_y_uses_the_height_basis_and_absolute_forms() {
    let mut d = Diagnostics::new();
    let b = basis(100.0, Some(400.0));
    assert_eq!(
        resolve_y(Some(Length::Percent(25.0)), &b, &mut d),
        Some(100.0)
    );
    assert_eq!(resolve_y(Some(Length::Pt(30.0)), &b, &mut d), Some(30.0));
    assert_eq!(resolve_y(None, &b, &mut d), None);
    assert!(d.is_empty(), "diagnostics: {d:?}");
}

#[test]
fn em_and_rem_resolve_against_the_font_bases_on_both_axes() {
    let mut d = Diagnostics::new();
    let mut b = basis(200.0, None);
    b.font = FontRel {
        em: 14.0,
        rem: 10.0,
    };
    assert_eq!(resolve_x(Some(Length::Em(2.0)), &b, &mut d), Some(28.0));
    assert_eq!(resolve_x(Some(Length::Rem(1.5)), &b, &mut d), Some(15.0));
    // Font-relative lengths need no height basis (unlike `%`).
    assert_eq!(resolve_y(Some(Length::Em(0.5)), &b, &mut d), Some(7.0));
    assert_eq!(resolve_y(Some(Length::Rem(3.0)), &b, &mut d), Some(30.0));
    assert!(d.is_empty(), "diagnostics: {d:?}");
}

#[test]
fn em_amplification_past_the_cap_is_dropped_with_a_diagnostic() {
    let mut d = Diagnostics::new();
    let mut b = basis(200.0, Some(100.0));
    b.font = FontRel {
        em: 1_000_000.0,
        rem: 10.0,
    };
    // 10em of a hostile 1e6pt em basis = 1e7pt, past the ±1e6 cap.
    assert_eq!(resolve_x(Some(Length::Em(10.0)), &b, &mut d), None);
    assert_eq!(resolve_y(Some(Length::Em(10.0)), &b, &mut d), None);
    assert!(d.iter().any(|x| x.code == "length_out_of_range"));
}

#[test]
fn percent_of_auto_height_is_dropped_with_a_diagnostic() {
    let mut d = Diagnostics::new();
    assert_eq!(
        resolve_y(Some(Length::Percent(50.0)), &basis(100.0, None), &mut d),
        None
    );
    assert!(d.iter().any(|x| x.code == "percent_of_auto"));
}

#[test]
fn resolve_y_caps_out_of_range_values() {
    let mut d = Diagnostics::new();
    let b = basis(100.0, Some(1000.0));
    assert_eq!(
        resolve_y(Some(Length::Percent(200_000.0)), &b, &mut d),
        None
    );
    assert!(d.iter().any(|x| x.code == "length_out_of_range"));
}

#[test]
fn unset_edges_are_zero() {
    let mut d = Diagnostics::new();
    assert_eq!(resolve_edges(None, &basis(100.0, None), &mut d), [0.0; 4]);
    assert!(d.is_empty(), "diagnostics: {d:?}");
}

#[test]
fn edge_percent_resolves_against_the_width_for_every_side() {
    let mut d = Diagnostics::new();
    let e = edges("{ top: \"10%\", bottom: 5 }");
    // Vertical edges use the WIDTH basis (CSS margin/padding rule), so
    // they resolve even with an auto height.
    let r = resolve_edges(Some(&e), &basis(200.0, None), &mut d);
    assert_eq!(r, [20.0, 0.0, 5.0, 0.0]);
    assert!(d.is_empty(), "diagnostics: {d:?}");
}

#[test]
fn out_of_range_edges_drop_to_zero() {
    let mut d = Diagnostics::new();
    let e = edges("{ left: \"200000%\" }");
    let r = resolve_edges(Some(&e), &basis(1000.0, None), &mut d);
    assert_eq!(r, [0.0; 4]);
    assert!(d.iter().any(|x| x.code == "length_out_of_range"));
}

#[test]
fn clamp_size_applies_min_and_max_and_is_a_noop_when_unset() {
    // Unset bounds leave the value; max caps; min floors.
    assert_eq!(clamp_size(50.0, None, None), 50.0);
    assert_eq!(clamp_size(50.0, None, Some(40.0)), 40.0);
    assert_eq!(clamp_size(50.0, Some(60.0), None), 60.0);
    // In range: neither bound bites.
    assert_eq!(clamp_size(50.0, Some(10.0), Some(90.0)), 50.0);
}

#[test]
fn clamp_size_lets_min_win_over_max_css_order() {
    // min-width beats max-width when they conflict (CSS): value 50,
    // max 8 would give 8, but min 20 wins → 20.
    assert_eq!(clamp_size(50.0, Some(20.0), Some(8.0)), 20.0);
}

#[test]
fn clamp_size_is_finite_safe_for_negative_bounds() {
    // A negative max forcing the size to 0-ish is well-defined, never a
    // panic; a negative min below the value is inert.
    assert_eq!(clamp_size(50.0, None, Some(-5.0)), -5.0);
    assert_eq!(clamp_size(50.0, Some(-5.0), None), 50.0);
}
