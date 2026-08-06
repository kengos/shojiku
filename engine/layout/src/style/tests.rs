//! Unit tests for the style cascade (`ComputedStyle` + primitives).

use super::*;
use shojiku_core::{BorderColor, BorderStyle, BorderWidth, Length, TextCombineUpright};

/// The single-inline cascade S1 shipped, now expressed via the two
/// primitives — kept as a test helper so the S1 semantics stay pinned.
fn cascade(inherited: &ComputedStyle, inline: &Style) -> ComputedStyle {
    ComputedStyle::base(inherited).overlaid(inline)
}

#[test]
fn default_is_the_engine_initial_values() {
    let d = ComputedStyle::default();
    assert_eq!(d.font_size, 10.0);
    assert_eq!(d.line_height, 1.4);
    assert!(d.font_family.is_none());
    assert!(d.color.is_none());
    assert_eq!(d.text_align, TextAlign::Left);
    assert_eq!(d.vertical_align, VerticalAlign::Top);
    assert_eq!(d.line_break, LineBreak::Normal);
    assert_eq!(d.text_spacing_trim, TextSpacingTrim::SpaceAll);
    assert_eq!(d.hanging_punctuation, HangingPunctuation::None);
    assert!(d.background_color.is_none());
    assert_eq!(d.border_widths, [0.0; 4]);
    assert!(d.border_colors.iter().all(Option::is_none));
    assert_eq!(d.border_styles, [BorderStyleKind::Solid; 4]);
    assert_eq!(d.border_radius, None, "corners start square");
    assert_eq!(d.text_overflow, TextOverflow::Visible);
    assert_eq!(d.font_weight, FontWeight::Normal);
    assert_eq!(d.font_style, FontStyle::Normal);
    assert_eq!(d.letter_spacing, 0.0);
}

#[test]
fn inline_overrides_inherited() {
    let inherited = ComputedStyle {
        font_size: 20.0,
        ..ComputedStyle::default()
    };
    let inline = Style {
        font_size: Some(Length::Pt(8.0)),
        ..Style::default()
    };
    assert_eq!(cascade(&inherited, &inline).font_size, 8.0);
}

#[test]
fn inherited_properties_flow_when_inline_unset() {
    let inherited = ComputedStyle {
        font_size: 20.0,
        color: Some("#ff0000".into()),
        font_family: Some("gothic".into()),
        line_height: 2.0,
        text_align: TextAlign::Right,
        line_break: LineBreak::Anywhere,
        text_spacing_trim: TextSpacingTrim::TrimStart,
        hanging_punctuation: HangingPunctuation::ForceEnd,
        font_weight: FontWeight::Bold,
        font_style: FontStyle::Italic,
        letter_spacing: 1.5,
        ..ComputedStyle::default()
    };
    let c = cascade(&inherited, &Style::default());
    assert_eq!(c.font_size, 20.0);
    assert_eq!(c.color.as_deref(), Some("#ff0000"));
    assert_eq!(c.font_family.as_deref(), Some("gothic"));
    assert_eq!(c.line_height, 2.0);
    assert_eq!(c.text_align, TextAlign::Right);
    assert_eq!(c.line_break, LineBreak::Anywhere);
    assert_eq!(c.text_spacing_trim, TextSpacingTrim::TrimStart);
    assert_eq!(c.hanging_punctuation, HangingPunctuation::ForceEnd);
    assert_eq!(c.font_weight, FontWeight::Bold);
    assert_eq!(c.font_style, FontStyle::Italic);
    assert_eq!(c.letter_spacing, 1.5);
}

#[test]
fn micro_typography_inline_overrides_inherited() {
    // Both keys inherit, and an inline layer wins over the inherited value.
    let inherited = ComputedStyle {
        text_spacing_trim: TextSpacingTrim::Normal,
        hanging_punctuation: HangingPunctuation::AllowEnd,
        ..ComputedStyle::default()
    };
    let inline = Style {
        text_spacing_trim: Some(TextSpacingTrim::TrimStart),
        hanging_punctuation: Some(HangingPunctuation::ForceEnd),
        ..Style::default()
    };
    let c = cascade(&inherited, &inline);
    assert_eq!(c.text_spacing_trim, TextSpacingTrim::TrimStart);
    assert_eq!(c.hanging_punctuation, HangingPunctuation::ForceEnd);
}

#[test]
fn non_inherited_properties_reset_not_flow() {
    // verticalAlign, backgroundColor, and the border properties must not
    // reach a child; all reset to initial unless the child sets them.
    let inherited = ComputedStyle {
        vertical_align: VerticalAlign::Bottom,
        background_color: Some("#eee".into()),
        border_widths: [2.0; 4],
        border_colors: [Some("#ccc".into()), None, None, None],
        text_overflow: TextOverflow::Ellipsis,
        ..ComputedStyle::default()
    };
    let reset = cascade(&inherited, &Style::default());
    assert_eq!(reset.vertical_align, VerticalAlign::Top);
    assert!(reset.background_color.is_none());
    assert_eq!(reset.border_widths, [0.0; 4]);
    assert!(reset.border_colors.iter().all(Option::is_none));
    assert_eq!(reset.text_overflow, TextOverflow::Visible);
    let inline = Style {
        vertical_align: Some(VerticalAlign::Middle),
        background_color: Some("#111".into()),
        border_width: Some(BorderWidth::All(0.5)),
        border_color: Some(BorderColor::All("#222".into())),
        text_overflow: Some(TextOverflow::Shrink),
        ..Style::default()
    };
    let set = cascade(&inherited, &inline);
    assert_eq!(set.vertical_align, VerticalAlign::Middle);
    assert_eq!(set.background_color.as_deref(), Some("#111"));
    assert_eq!(set.border_widths, [0.5; 4]);
    assert_eq!(set.border_colors[2].as_deref(), Some("#222"));
    assert_eq!(set.text_overflow, TextOverflow::Shrink);
}

#[test]
fn overlaid_applies_every_property_it_sets() {
    // A fully-populated layer overrides every field of the base.
    let full = Style {
        font_size: Some(Length::Pt(7.0)),
        font_family: Some("mincho".into()),
        line_height: Some(1.1),
        color: Some("#010203".into()),
        text_align: Some(TextAlign::Center),
        vertical_align: Some(VerticalAlign::Bottom),
        line_break: Some(LineBreak::Anywhere),
        text_spacing_trim: Some(TextSpacingTrim::Normal),
        hanging_punctuation: Some(HangingPunctuation::ForceEnd),
        background_color: Some("#fafafa".into()),
        border_width: Some(BorderWidth::PerSide([Some(1.5), None, Some(2.0), None])),
        border_color: Some(BorderColor::All("#040506".into())),
        border_radius: Some(Length::Pt(3.0)),
        border_style: Some(BorderStyle::All(BorderStyleKind::Double)),
        text_overflow: Some(TextOverflow::Ellipsis),
        font_weight: Some(FontWeight::Bold),
        font_style: Some(FontStyle::Italic),
        letter_spacing: Some(Length::Pt(-0.25)),
        overflow: Some(Overflow::Hidden),
        text_decoration: Some(TextDecoration::Underline),
        opacity: Some(0.5),
        writing_mode: Some(WritingMode::VerticalRl),
        text_orientation: Some(TextOrientation::Upright),
        text_combine_upright: Some(TextCombineUpright::Digits(2)),
    };
    let c = ComputedStyle::default().overlaid(&full);
    assert_eq!(c.font_size, 7.0);
    assert_eq!(c.font_family.as_deref(), Some("mincho"));
    assert_eq!(c.line_height, 1.1);
    assert_eq!(c.color.as_deref(), Some("#010203"));
    assert_eq!(c.text_align, TextAlign::Center);
    assert_eq!(c.vertical_align, VerticalAlign::Bottom);
    assert_eq!(c.line_break, LineBreak::Anywhere);
    assert_eq!(c.text_spacing_trim, TextSpacingTrim::Normal);
    assert_eq!(c.hanging_punctuation, HangingPunctuation::ForceEnd);
    assert_eq!(c.background_color.as_deref(), Some("#fafafa"));
    assert_eq!(c.border_widths, [1.5, 0.0, 2.0, 0.0]);
    assert_eq!(c.border_colors[0].as_deref(), Some("#040506"));
    assert_eq!(c.border_styles, [BorderStyleKind::Double; 4]);
    assert_eq!(c.border_radius, Some(Length::Pt(3.0)));
    assert_eq!(c.text_overflow, TextOverflow::Ellipsis);
    assert_eq!(c.font_weight, FontWeight::Bold);
    assert_eq!(c.font_style, FontStyle::Italic);
    assert_eq!(c.letter_spacing, -0.25);
    assert_eq!(c.overflow, Overflow::Hidden);
    assert_eq!(c.text_decoration, TextDecoration::Underline);
    assert_eq!(c.opacity, 0.5);
    assert_eq!(c.writing_mode, WritingMode::VerticalRl);
    assert_eq!(c.text_orientation, TextOrientation::Upright);
    assert_eq!(c.text_combine_upright, TextCombineUpright::Digits(2));
}

#[test]
fn decoration_and_opacity_do_not_inherit() {
    // `textDecoration` and `opacity` are non-inherited (matches CSS): a
    // decorated, translucent ancestor must not leak either onto children
    // via `base`.
    let ancestor = ComputedStyle::default().overlaid(&Style {
        text_decoration: Some(TextDecoration::LineThrough),
        opacity: Some(0.3),
        ..Style::default()
    });
    let child = ComputedStyle::base(&ancestor);
    assert_eq!(child.text_decoration, TextDecoration::None);
    assert_eq!(child.opacity, 1.0);
}

#[test]
fn relative_font_size_resolves_against_the_inherited_value() {
    // `em`/`%` multiply the value beneath (CSS: em on font-size = parent
    // font-size); `rem` scales the engine default regardless of context.
    let inherited = ComputedStyle {
        font_size: 20.0,
        ..ComputedStyle::default()
    };
    let em = Style {
        font_size: Some(Length::Em(1.5)),
        ..Style::default()
    };
    assert_eq!(cascade(&inherited, &em).font_size, 30.0);
    let pct = Style {
        font_size: Some(Length::Percent(150.0)),
        ..Style::default()
    };
    assert_eq!(cascade(&inherited, &pct).font_size, 30.0);
    let rem = Style {
        font_size: Some(Length::Rem(1.5)),
        ..Style::default()
    };
    assert_eq!(cascade(&inherited, &rem).font_size, 15.0);
}

#[test]
fn nested_em_font_sizes_multiply_through_layers() {
    let outer = Style {
        font_size: Some(Length::Em(2.0)),
        ..Style::default()
    };
    let inner = Style {
        font_size: Some(Length::Em(1.5)),
        ..Style::default()
    };
    // 10 (default) × 2 × 1.5 = 30.
    let c = ComputedStyle::base(&ComputedStyle::default())
        .overlaid(&outer)
        .overlaid(&inner);
    assert_eq!(c.font_size, 30.0);
}

#[test]
fn em_letter_spacing_tracks_the_own_font_size() {
    // A same-layer fontSize applies before letterSpacing (CSS: em
    // letter-spacing refers to the element's own font size).
    let layer = Style {
        font_size: Some(Length::Pt(20.0)),
        letter_spacing: Some(Length::Em(0.1)),
        ..Style::default()
    };
    let c = ComputedStyle::default().overlaid(&layer);
    assert!((c.letter_spacing - 2.0).abs() < 1e-9);
    // A hand-constructed `%` (parse-rejected on the wire) degrades to 0.
    let pct = Style {
        letter_spacing: Some(Length::Percent(50.0)),
        ..Style::default()
    };
    assert_eq!(ComputedStyle::default().overlaid(&pct).letter_spacing, 0.0);
}

#[test]
fn named_layers_apply_low_to_high_later_wins() {
    // Two layers then inline: later layer beats earlier; inline beats
    // both. Mirrors the engine's registry fold order.
    let a = Style {
        font_size: Some(Length::Pt(10.0)),
        color: Some("#a".into()),
        ..Style::default()
    };
    let b = Style {
        font_size: Some(Length::Pt(20.0)),
        ..Style::default()
    };
    let inline = Style {
        color: Some("#z".into()),
        ..Style::default()
    };
    let c = ComputedStyle::base(&ComputedStyle::default())
        .overlaid(&a)
        .overlaid(&b)
        .overlaid(&inline);
    assert_eq!(c.font_size, 20.0); // b beat a
    assert_eq!(c.color.as_deref(), Some("#z")); // inline beat a
}

#[test]
fn text_combine_upright_type_mismatch_rejects_in_a_dependent_parse() {
    // Drives the visitor's `expecting` in THIS crate's copy of core (a
    // bare scalar is neither authored form) — the workspace coverage
    // counts each linked copy separately.
    let err = shojiku_core::parse_template(
        "sections:\n  body:\n    type: flow\n    items:\n      - type: text\n        text: a\n        style: { textCombineUpright: [] }\n",
    );
    assert!(
        err.is_err(),
        "a sequence is neither `none` nor a digits map"
    );
}
