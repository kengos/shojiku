//! Single-page render primitives: parity with the all-pages path + bounds.

use super::*;

/// A three-page doc whose pages differ (a red rect at a different y each page),
/// so a wrong page selection would produce different bytes.
fn three_page_doc() -> LayoutDocument {
    let mut doc = base_doc();
    doc.pages.clear();
    for i in 0..3u32 {
        doc.pages.push(LayoutPage {
            items: vec![LayoutItem::Rect(RectShape {
                x: 0.0,
                y: f64::from(i) * 10.0,
                w: 20.0,
                h: 20.0,
                stroke: None,
                stroke_width: 0.0,
                fill: Some((1.0, 0.0, 0.0)),
                opacity: 1.0,
                ..Default::default()
            })],
        });
    }
    doc
}

#[test]
fn png_page_is_byte_identical_to_that_all_pages_entry() {
    let doc = three_page_doc();
    let all = render_png(&doc, fonts(), &AssetStore::empty(), &PngOptions::default()).expect("all");
    for (i, page) in all.iter().enumerate() {
        let one = render_png_page(
            &doc,
            fonts(),
            &AssetStore::empty(),
            &PngOptions::default(),
            i,
        )
        .expect("one");
        assert_eq!(&one, page, "page {i} differs");
    }
}

#[test]
fn raw_page_is_byte_identical_to_that_all_pages_entry() {
    let doc = three_page_doc();
    let all = render_raw(&doc, fonts(), &AssetStore::empty(), &PngOptions::default()).expect("all");
    for (i, page) in all.iter().enumerate() {
        let one = render_raw_page(
            &doc,
            fonts(),
            &AssetStore::empty(),
            &PngOptions::default(),
            i,
        )
        .expect("one");
        assert_eq!(
            (one.width_px, one.height_px),
            (page.width_px, page.height_px)
        );
        assert_eq!(one.rgba, page.rgba, "page {i} differs");
    }
}

#[test]
fn a_page_past_the_end_is_out_of_range() {
    let doc = three_page_doc(); // valid indices 0..=2
    let err = render_png_page(
        &doc,
        fonts(),
        &AssetStore::empty(),
        &PngOptions::default(),
        3,
    )
    .expect_err("out of range");
    assert!(matches!(
        err,
        RenderPngError::PageOutOfRange { page: 3, total: 3 }
    ));
    assert!(err.to_string().contains("page index 3 is out of range"));
    // usize::MAX must not overflow the bounds check or the total.
    assert!(matches!(
        render_raw_page(
            &doc,
            fonts(),
            &AssetStore::empty(),
            &PngOptions::default(),
            usize::MAX
        ),
        Err(RenderPngError::PageOutOfRange { page, total: 3 }) if page == usize::MAX
    ));
}

#[test]
fn single_page_paths_share_the_input_guards() {
    // The shared RenderRun::start runs before the bounds check, so a bad
    // scale is rejected regardless of the page index.
    let doc = three_page_doc();
    assert!(matches!(
        render_png_page(
            &doc,
            fonts(),
            &AssetStore::empty(),
            &PngOptions { scale: f64::NAN },
            0
        ),
        Err(RenderPngError::BadScale(_))
    ));
    assert!(matches!(
        render_raw_page(
            &doc,
            fonts(),
            &AssetStore::empty(),
            &PngOptions { scale: -1.0 },
            0
        ),
        Err(RenderPngError::BadScale(_))
    ));
}
