//! Unit tests for the layout-tree contract: serialization tags and the
//! renderer-shared policy constants.

use super::*;

#[test]
fn synthetic_variant_policy_is_layout_owned() {
    // Both renderers read these off the tree; pin the concrete values
    // so PDF/PNG drift shows up here first.
    let block = TextBlock {
        font_id: "f".to_string(),
        fallback_ids: Vec::new(),
        font_size: 20.0,
        line_height: 28.0,
        letter_spacing: 0.0,
        color: (0.0, 0.0, 0.0),
        synthetic_bold: true,
        synthetic_italic: true,
        decoration: None,
        opacity: 1.0,
        baseline: None,
        link: None,
        text_spacing_trim: shojiku_core::TextSpacingTrim::SpaceAll,
        vertical: None,
        text_combine: None,
        lines: vec![],
    };
    assert!((block.synthetic_bold_stroke_width() - 0.6).abs() < 1e-9);
    // ~12° slant, expressed as its tangent.
    assert!((TextBlock::SYNTHETIC_ITALIC_SKEW - 0.212_56).abs() < 1e-9);
}

#[test]
fn line_runs_yields_implicit_run_for_plain_lines_and_explicit_for_rich() {
    let mut block = TextBlock {
        font_id: "f".to_string(),
        fallback_ids: vec!["fb".to_string()],
        font_size: 20.0,
        line_height: 28.0,
        letter_spacing: 0.5,
        color: (0.0, 0.5, 1.0),
        synthetic_bold: true,
        synthetic_italic: false,
        decoration: Some(DecorationSpec {
            offset: 18.0,
            thickness: 1.0,
        }),
        opacity: 1.0,
        baseline: None,
        link: None,
        text_spacing_trim: shojiku_core::TextSpacingTrim::SpaceAll,
        vertical: None,
        text_combine: None,
        lines: vec![TextLine {
            text: "plain".to_string(),
            x: 3.0,
            y: 7.0,
            width: 50.0,
            runs: Vec::new(),
        }],
    };
    // Plain line: one implicit run mirroring the block-level fields.
    let runs = block.line_runs(&block.lines[0]);
    assert_eq!(runs.len(), 1);
    let run = &runs[0];
    assert_eq!(run.text, "plain");
    assert_eq!(run.x, 3.0);
    assert_eq!(run.width, 50.0);
    assert_eq!(run.font_id, "f");
    assert_eq!(run.fallback_ids, ["fb".to_string()]);
    assert_eq!(run.font_size, 20.0);
    assert_eq!(run.letter_spacing, 0.5);
    assert_eq!(run.color, (0.0, 0.5, 1.0));
    assert!(run.synthetic_bold);
    assert!(!run.synthetic_italic);
    assert!(run.decoration.is_some());
    // Rich line: the explicit runs come back as-is.
    block.lines[0].runs.push(TextRun {
        combine: None,
        text: "rich".to_string(),
        span: 2,
        link: None,
        x: 10.0,
        width: 40.0,
        font_id: "g".to_string(),
        fallback_ids: Vec::new(),
        font_size: 12.0,
        letter_spacing: 0.0,
        color: (0.0, 0.0, 0.0),
        synthetic_bold: false,
        synthetic_italic: true,
        decoration: None,
    });
    let runs = block.line_runs(&block.lines[0]);
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].text, "rich");
    assert_eq!(runs[0].span, Some(2));
    assert_eq!(runs[0].font_id, "g");
    // Run-level synthetic bold scales by the run's own size.
    assert!((runs[0].synthetic_bold_stroke_width() - 0.36).abs() < 1e-9);
    // Baseline: rich blocks carry it; plain blocks fall back to the
    // primary ascent the caller passes.
    assert_eq!(block.baseline_offset(15.5), 15.5);
    block.baseline = Some(21.0);
    assert_eq!(block.baseline_offset(15.5), 21.0);
}

#[test]
fn text_run_combine_serializes_only_when_set() {
    let mut run = TextRun {
        combine: None,
        text: "31".to_string(),
        span: 0,
        link: None,
        x: 0.0,
        width: 10.0,
        font_id: "f".to_string(),
        fallback_ids: Vec::new(),
        font_size: 10.0,
        letter_spacing: 0.0,
        color: (0.0, 0.0, 0.0),
        synthetic_bold: false,
        synthetic_italic: false,
        decoration: None,
    };
    // Absent combine keeps the pre-existing rich wire byte-identical.
    let v = serde_json::to_value(&run).expect("json");
    assert!(v.get("combine").is_none(), "got: {v}");
    run.combine = Some(shojiku_core::TextCombine::Digits(2));
    let v = serde_json::to_value(&run).expect("json");
    assert_eq!(v["combine"], serde_json::json!({ "digits": 2 }));
    run.combine = Some(shojiku_core::TextCombine::All);
    let v = serde_json::to_value(&run).expect("json");
    assert_eq!(v["combine"], serde_json::json!("all"));
}

#[test]
fn serializes_with_kind_tags() {
    let doc = LayoutDocument {
        page_width: 595.28,
        page_height: 841.89,
        pages: vec![LayoutPage {
            items: vec![
                LayoutItem::Rect(RectShape {
                    x: 0.0,
                    y: 0.0,
                    w: 10.0,
                    h: 10.0,
                    stroke: Some((0.0, 0.0, 0.0)),
                    stroke_width: 1.0,
                    fill: None,
                    opacity: 1.0,
                    ..Default::default()
                }),
                LayoutItem::Line(LineShape {
                    x1: 0.0,
                    y1: 0.0,
                    x2: 5.0,
                    y2: 5.0,
                    width: 0.5,
                    color: (0.0, 0.0, 0.0),
                    opacity: 1.0,
                    ..Default::default()
                }),
                LayoutItem::Image(ImageShape {
                    asset_id: "src:logo.svg".to_string(),
                    opacity: 1.0,
                    link: None,
                    x: 1.0,
                    y: 2.0,
                    w: 3.0,
                    h: 4.0,
                }),
                // The D2 clip group nests items; inspect consumers
                // must see the nested kind tags.
                LayoutItem::Clip(ClipShape {
                    x: 0.0,
                    y: 0.0,
                    w: 8.0,
                    h: 8.0,
                    items: vec![LayoutItem::Rect(RectShape {
                        x: 1.0,
                        y: 1.0,
                        w: 20.0,
                        h: 20.0,
                        stroke: None,
                        stroke_width: 0.0,
                        fill: None,
                        opacity: 1.0,
                        ..Default::default()
                    })],
                    ..Default::default()
                }),
            ],
        }],
    };
    let json = serde_json::to_string(&doc).expect("serialize");
    assert!(json.contains("\"kind\":\"rect\""));
    assert!(json.contains("\"kind\":\"line\""));
    assert!(json.contains("\"kind\":\"image\""));
    assert!(json.contains("\"kind\":\"clip\""));
    assert!(json.contains("\"items\":[{\"kind\":\"rect\""));
    assert!(json.contains("src:logo.svg"));
    assert!(json.contains("\"page_width\":595.28"));
}

#[test]
fn plain_lines_serialize_without_runs_or_baseline() {
    // The RT1 widening is additive: a plain block's JSON must not grow
    // `runs`/`baseline` noise (inspect stability for pre-span documents).
    let block = TextBlock {
        font_id: "f".to_string(),
        fallback_ids: Vec::new(),
        font_size: 10.0,
        line_height: 14.0,
        letter_spacing: 0.0,
        color: (0.0, 0.0, 0.0),
        synthetic_bold: false,
        synthetic_italic: false,
        decoration: None,
        opacity: 1.0,
        baseline: None,
        link: None,
        text_spacing_trim: shojiku_core::TextSpacingTrim::SpaceAll,
        vertical: None,
        text_combine: None,
        lines: vec![TextLine {
            text: "t".to_string(),
            x: 0.0,
            y: 0.0,
            width: 5.0,
            runs: Vec::new(),
        }],
    };
    let json = serde_json::to_string(&block).expect("serialize");
    assert!(!json.contains("\"runs\""), "got: {json}");
    assert!(!json.contains("\"baseline\""), "got: {json}");
}
