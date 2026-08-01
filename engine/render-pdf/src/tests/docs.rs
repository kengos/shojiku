//! Document structure: text, tables, pages, fonts, errors.

use super::*;

#[test]
fn renders_japanese_text_to_valid_pdf() {
    let bytes = render_template(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 25, y: 100, w: 500, h: 600 }
    items:
      - type: text
        text: 領収書（サンプル）
        style: { fontSize: 20 }
      - type: rect
        style: { borderWidth: 1 }
        box: { w: 200, h: 50 }
      - type: line
        from: { x: 0, y: 10 }
        to: { x: 200, y: 10 }
"#,
        json!({}),
    );
    assert!(bytes.starts_with(b"%PDF-"));
    // krilla subsets the CJK face: the output must stay far below the
    // ~6 MB full-font embed the printpdf backend used to produce,
    // while still carrying real glyph outlines.
    assert!(bytes.len() < 300_000, "suspiciously large: {}", bytes.len());
    assert!(bytes.len() > 1_000, "suspiciously small: {}", bytes.len());
}

#[test]
fn renders_text_with_unmappable_char() {
    // U+10FFFF has no glyph in the face: layout raises a `missing_glyph`
    // warning (not an error) and the char draws as .notdef, but the PDF
    // still writes. Exercises the missing-glyph path in this backend's
    // linked copy of the layout engine so coverage holds across binaries.
    let bytes = render_template(
            "sections:\n  body:\n    type: flow\n    box: { x: 25, y: 100, w: 500, h: 600 }\n    items:\n      - type: text\n        text: \"A\u{10FFFF}B\"\n",
            json!({}),
        );
    assert!(bytes.starts_with(b"%PDF-"));
}

#[test]
fn renders_multi_page_table() {
    let rows: Vec<serde_json::Value> = (1..=60)
        .map(|i| json!({"name": format!("行 {i}")}))
        .collect();
    let bytes = render_template(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 25, y: 100, w: 500, h: 300 }
    items:
      - type: table
        data: { key: items }
        columns:
          - label: 名前
            data: { key: name }
            width: 200
"#,
        json!({ "items": rows }),
    );
    assert!(bytes.starts_with(b"%PDF-"));
    let content = String::from_utf8_lossy(&bytes);
    // Multiple page objects prove pagination reached the PDF. The
    // matcher tolerates pdf-writer's `/Type /Page` spacing.
    let page_count = content.matches("/Type /Page").count() + content.matches("/Type/Page").count();
    assert!(page_count >= 2, "expected multiple pages, got {page_count}");
}

#[test]
fn renders_fill_only_rect_and_blank_text_lines() {
    // Covers the Fill paint mode (borderWidth 0 + fill) and the
    // skip-empty-line path (the middle paragraph of "a\n\nb").
    let bytes = render_template(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 25, y: 100, w: 500, h: 600 }
    items:
      - type: rect
        box: { w: 100, h: 40 }
        style: { borderWidth: 0, backgroundColor: "#eeeeee" }
      - type: rect
        box: { w: 100, h: 40 }
        style: { backgroundColor: "#eeeeee" }
      - type: text
        text: "a\n\nb"
"##,
        json!({}),
    );
    assert!(bytes.starts_with(b"%PDF-"));
}

#[test]
fn unknown_font_id_in_layout_is_an_error() {
    let (_pack, fonts) = shared_fonts();
    let doc = LayoutDocument {
        page_width: 595.28,
        page_height: 841.89,
        pages: vec![shojiku_layout::LayoutPage {
            items: vec![shojiku_layout::LayoutItem::Text(
                shojiku_layout::TextBlock {
                    font_id: "ghost".to_string(),
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
                    lines: vec![shojiku_layout::TextLine {
                        text: "x".to_string(),
                        x: 0.0,
                        y: 0.0,
                        width: 0.0,
                        runs: Vec::new(),
                    }],
                },
            )],
        }],
    };
    assert!(matches!(
        render_pdf(&doc, fonts, &AssetStore::empty(), "x"),
        Err(RenderError::UnknownFont(id)) if id == "ghost"
    ));
}

#[test]
fn non_positive_page_size_is_an_error() {
    let (_pack, fonts) = shared_fonts();
    let doc = LayoutDocument {
        page_width: 0.0,
        page_height: 841.89,
        pages: vec![shojiku_layout::LayoutPage { items: vec![] }],
    };
    assert!(matches!(
        render_pdf(&doc, fonts, &AssetStore::empty(), "x"),
        Err(RenderError::BadPageSize(w, _)) if w == 0.0
    ));
}

#[test]
fn glyph_mapping_matches_measurement() {
    let (_pack, fonts) = shared_fonts();
    let face = fonts.face(None);

    use krilla::text::Glyph;

    // "あ" maps to a real glyph with the full-width CJK advance;
    // x_advance is em-normalized, so it is size-independent (here 12pt).
    let glyphs = map_glyphs(&face.positioned_glyphs("あ\u{10FFFF}", 12.0, 0.0), 12.0);
    assert_eq!(glyphs.len(), 2);
    assert!((f64::from(glyphs[0].x_advance(1.0)) - 1.0).abs() < 0.1);

    // U+10FFFF has no glyph: .notdef (gid 0) with the 0.6 em fallback
    // FontFace applies, keeping drawing and wrapping in agreement.
    assert_eq!(glyphs[1].glyph_id().to_u32(), 0);
    assert!((f64::from(glyphs[1].x_advance(1.0)) - 0.6).abs() < 1e-6);

    // Letter spacing rides the advance em-normalized: +6pt at 12pt adds
    // 0.5 em to every glyph, .notdef included.
    let spaced = map_glyphs(&face.positioned_glyphs("あ\u{10FFFF}", 12.0, 6.0), 12.0);
    assert!(
        (f64::from(spaced[0].x_advance(1.0)) - f64::from(glyphs[0].x_advance(1.0)) - 0.5).abs()
            < 1e-6
    );
    assert!((f64::from(spaced[1].x_advance(1.0)) - 1.1).abs() < 1e-6);
}

#[test]
fn renders_synthetic_bold_italic_and_letter_spacing() {
    // Exercises the faux-bold stroke, per-line skew, and letter-spacing
    // paths of the text arm end to end; output must still be a valid PDF.
    let bytes = render_template(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 25, y: 100, w: 500, h: 600 }
    items:
      - type: text
        text: 太字サンプル
        style: { fontWeight: bold, letterSpacing: 1.5 }
      - type: text
        text: 斜体サンプル
        style: { fontStyle: italic }
"#,
        json!({}),
    );
    assert!(bytes.starts_with(b"%PDF-"));
    assert!(bytes.len() > 1_000, "suspiciously small: {}", bytes.len());
}

#[test]
fn italic_skew_leans_right_and_fixes_the_baseline() {
    let t = italic_skew(100.0);
    let k = shojiku_layout::TextBlock::SYNTHETIC_ITALIC_SKEW as f32;
    // x' = x + kx·y + tx: on the baseline (y = 100) x is unchanged;
    // above it (smaller y, y-down) x moves right.
    assert!((t.kx() + k).abs() < 1e-6);
    assert!((t.tx() - k * 100.0).abs() < 1e-4);
    let x_on_baseline = t.kx() * 100.0 + t.tx();
    assert!(x_on_baseline.abs() < 1e-4);
    let x_above = t.kx() * 50.0 + t.tx();
    assert!(x_above > 0.0);
    // y is untouched (no vertical shear or scale).
    assert_eq!(t.ky(), 0.0);
    assert_eq!(t.sy(), 1.0);
}

#[test]
fn em_advance_guards_non_positive_size() {
    // Normal case divides pt by size; a hand-built tree with size 0
    // must not produce a non-finite advance.
    assert!((em_advance(6.0, 12.0) - 0.5).abs() < 1e-9);
    assert_eq!(em_advance(6.0, 0.0), 0.0);
}

#[test]
fn degenerate_shapes_produce_no_path() {
    assert!(rect_path(f64::NAN, 0.0, 10.0, 10.0).is_none());
    assert!(line_path(f64::NAN, 0.0, 1.0, 1.0).is_none());
    assert!(rect_path(0.0, 0.0, 10.0, 10.0).is_some());
    assert!(line_path(0.0, 0.0, 1.0, 1.0).is_some());
}

#[test]
fn error_mappers_wrap_messages() {
    let embed = embed_error("ghost");
    assert!(matches!(embed, RenderError::Embed(_)));
    assert!(embed.to_string().contains("ghost"));

    let write = write_error(std::io::Error::other("disk gone"));
    assert!(matches!(write, RenderError::Write(_)));
    assert!(write.to_string().contains("disk gone"));
}

#[test]
fn empty_layout_is_an_error() {
    let (_pack, fonts) = shared_fonts();
    let empty = LayoutDocument {
        page_width: 595.28,
        page_height: 841.89,
        pages: vec![],
    };
    assert!(matches!(
        render_pdf(&empty, fonts, &AssetStore::empty(), "x"),
        Err(RenderError::NoPages)
    ));
}
