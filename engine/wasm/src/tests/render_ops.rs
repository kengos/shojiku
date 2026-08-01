//! Validate + render: the three-part outcome, document-error-as-diagnostics,
//! and the host-misuse guards.

use super::*;

/// A session with a locale but no fonts — to reach render's second guard.
fn locale_only_session() -> Session {
    let mut session = Session::new();
    session.set_locale("ja-JP", None).expect("locale");
    session
}

#[test]
fn validate_returns_a_clean_diagnostics_set() {
    let session = Session::new();
    let diags = session.validate(TEMPLATE, None, None);
    assert!(diags.items.is_empty());
}

#[test]
fn validate_surfaces_a_parse_error() {
    let session = Session::new();
    let diags = session.validate("{{{ not yaml", None, None);
    assert!(diags.items.iter().any(|d| d.code == "parse_error"));
}

#[test]
fn render_guards_locale_first_then_fonts() {
    // Bare session: the locale guard fires first — it is also the setup
    // order, so the error names the actual first step (set_locale).
    assert!(matches!(
        Session::new().render(PageFormat::Png, TEMPLATE, "{}", None, 2.0, None),
        Err(WasmError::LocaleNotSet)
    ));
    // Locale set but no fonts: the fonts guard fires next.
    assert!(matches!(
        locale_only_session().render(PageFormat::Png, TEMPLATE, "{}", None, 2.0, None),
        Err(WasmError::FontsNotLoaded)
    ));
}

#[test]
fn render_rejects_a_non_finite_scale() {
    let session = ready_session();
    for scale in [0.0, -1.0, f64::NAN, f64::INFINITY] {
        assert!(matches!(
            session.render(PageFormat::Raw, TEMPLATE, "{}", None, scale, None),
            Err(WasmError::BadScale(_))
        ));
    }
}

#[test]
fn the_scale_gate_answers_before_the_document_is_parsed() {
    // Stage ORDER is observable: with a bad scale AND a broken document, the
    // host hears about the argument it got wrong, not about the document. A
    // happy-path scale test cannot see this, so it is pinned separately.
    let session = ready_session();
    assert!(matches!(
        session.render(PageFormat::Raw, "{{{ not yaml", "{}", None, 0.0, None),
        Err(WasmError::BadScale(_))
    ));
}

#[test]
fn render_png_produces_the_three_part_outcome() {
    let session = ready_session();
    let outcome = session
        .render(PageFormat::Png, TEMPLATE, "{}", None, 2.0, None)
        .unwrap();
    assert!(outcome.prepared.is_some());
    assert!(!outcome.prepared.as_ref().unwrap().document.pages.is_empty());
    match &outcome.pages {
        Pages::Png(pages) => {
            assert_eq!(pages.len(), 1);
            assert!(pages[0].starts_with(b"\x89PNG"));
        }
        Pages::Raw(_) => panic!("expected PNG pages"),
    }
    // A clean document → no error diagnostics.
    assert!(!outcome.diagnostics.has_errors());
}

#[test]
fn render_raw_produces_rgba_pages() {
    let session = ready_session();
    let outcome = session
        .render(PageFormat::Raw, TEMPLATE, "{}", None, 1.0, None)
        .unwrap();
    match &outcome.pages {
        Pages::Raw(pages) => {
            assert_eq!(pages.len(), 1);
            let page = &pages[0];
            assert_eq!(
                page.rgba.len(),
                page.width_px as usize * page.height_px as usize * 4
            );
        }
        Pages::Png(_) => panic!("expected raw pages"),
    }
}

#[test]
fn a_render_stage_failure_is_a_host_error() {
    // A finite, positive scale that blows the canvas pixel cap is a render
    // error (not a document diagnostic) — both preview forms surface it.
    let session = ready_session();
    assert!(matches!(
        session.render(PageFormat::Png, TEMPLATE, "{}", None, 100.0, None),
        Err(WasmError::Render(_))
    ));
    assert!(matches!(
        session.render(PageFormat::Raw, TEMPLATE, "{}", None, 100.0, None),
        Err(WasmError::Render(_))
    ));
}

#[test]
fn a_parse_error_renders_no_pages_with_diagnostics() {
    let session = ready_session();
    let outcome = session
        .render(PageFormat::Png, "{{{ not yaml", "{}", None, 2.0, None)
        .unwrap();
    assert!(outcome.prepared.is_none());
    match &outcome.pages {
        Pages::Png(pages) => assert!(pages.is_empty()),
        Pages::Raw(_) => panic!("format preserved"),
    }
    assert!(outcome
        .diagnostics
        .items
        .iter()
        .any(|d| d.code == "parse_error"));
}

#[test]
fn a_validation_error_renders_no_pages_with_diagnostics() {
    // An image with neither `src` nor `data` is an `image_source_missing`
    // validation error (needs no definitions) — a document error, not a throw.
    let bad = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: image
        box: { x: 0, y: 0, w: 50, h: 50 }
"#;
    let session = ready_session();
    let outcome = session
        .render(PageFormat::Raw, bad, "{}", None, 2.0, None)
        .unwrap();
    assert!(outcome.prepared.is_none());
    match &outcome.pages {
        Pages::Raw(pages) => assert!(pages.is_empty()),
        Pages::Png(_) => panic!("format preserved"),
    }
    assert!(outcome
        .diagnostics
        .items
        .iter()
        .any(|d| d.code == "image_source_missing"));
}

#[test]
fn page_format_is_comparable() {
    // The enum drives a match in render; pin its derives.
    assert_eq!(PageFormat::Png, PageFormat::Png);
    assert_ne!(PageFormat::Png, PageFormat::Raw);
}

#[test]
fn a_selected_page_matches_the_all_pages_render() {
    let session = ready_session();
    let tpl = multipage_template(3);

    // PNG: page index 1 alone equals page 1 of the all-pages render.
    let all_pages = match session
        .render(PageFormat::Png, &tpl, "{}", None, 1.0, None)
        .unwrap()
        .pages
    {
        Pages::Png(p) => p,
        Pages::Raw(_) => panic!("expected PNG"),
    };
    assert_eq!(all_pages.len(), 3);
    let one = session
        .render(PageFormat::Png, &tpl, "{}", None, 1.0, Some(1))
        .unwrap();
    // The three-part bundle stays intact for a single page.
    assert!(one.prepared.is_some());
    assert!(!one.diagnostics.has_errors());
    match one.pages {
        Pages::Png(p) => {
            assert_eq!(p.len(), 1);
            assert_eq!(p[0], all_pages[1]);
        }
        Pages::Raw(_) => panic!("expected PNG"),
    }

    // Raw parity for a different page index.
    let all_raw = match session
        .render(PageFormat::Raw, &tpl, "{}", None, 1.0, None)
        .unwrap()
        .pages
    {
        Pages::Raw(p) => p,
        Pages::Png(_) => panic!("expected raw"),
    };
    match session
        .render(PageFormat::Raw, &tpl, "{}", None, 1.0, Some(2))
        .unwrap()
        .pages
    {
        Pages::Raw(p) => {
            assert_eq!(p.len(), 1);
            assert_eq!(p[0].rgba, all_raw[2].rgba);
        }
        Pages::Png(_) => panic!("expected raw"),
    }
}

#[test]
fn an_out_of_range_page_is_a_host_error() {
    let session = ready_session();
    // TEMPLATE lays out to one page; index 1 and u32::MAX are past the end.
    assert!(matches!(
        session.render(PageFormat::Png, TEMPLATE, "{}", None, 2.0, Some(1)),
        Err(WasmError::PageOutOfRange { page: 1, total: 1 })
    ));
    assert!(matches!(
        session.render(PageFormat::Raw, TEMPLATE, "{}", None, 2.0, Some(u32::MAX)),
        Err(WasmError::PageOutOfRange { page, total: 1 }) if page == u32::MAX as usize
    ));
}

#[test]
fn a_raw_all_pages_render_over_the_cap_is_a_host_error() {
    use crate::render::MAX_RAW_PAGES;
    let session = ready_session();
    let count = MAX_RAW_PAGES + 5;
    let tpl = multipage_template(count);

    // Raw, all pages, over the cap: the typed error names the numbers.
    assert!(matches!(
        session.render(PageFormat::Raw, &tpl, "{}", None, 1.0, None),
        Err(WasmError::TooManyRawPages { total, cap }) if total == count && cap == MAX_RAW_PAGES
    ));
    // The PNG all-pages form is uncapped — it encodes and drops each page.
    match session
        .render(PageFormat::Png, &tpl, "{}", None, 1.0, None)
        .unwrap()
        .pages
    {
        Pages::Png(p) => assert_eq!(p.len(), count),
        Pages::Raw(_) => panic!("expected PNG"),
    }
    // A single raw page from the same document bypasses the cap.
    match session
        .render(PageFormat::Raw, &tpl, "{}", None, 1.0, Some(0))
        .unwrap()
        .pages
    {
        Pages::Raw(p) => assert_eq!(p.len(), 1),
        Pages::Png(_) => panic!("expected raw"),
    }
}

#[test]
fn a_document_error_with_a_page_arg_still_returns_diagnostics() {
    // The page arg is irrelevant on the document-error path — no throw.
    let session = ready_session();
    let outcome = session
        .render(PageFormat::Png, "{{{ not yaml", "{}", None, 2.0, Some(0))
        .unwrap();
    assert!(outcome.prepared.is_none());
    match outcome.pages {
        Pages::Png(p) => assert!(p.is_empty()),
        Pages::Raw(_) => panic!("format preserved"),
    }
    assert!(outcome
        .diagnostics
        .items
        .iter()
        .any(|d| d.code == "parse_error"));
}
