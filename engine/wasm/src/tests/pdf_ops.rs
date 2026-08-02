//! The PDF render op: real deliverable bytes over the same stage the preview
//! ops use. Covers the happy path's structure, the document-error path (empty
//! bytes plus explaining diagnostics, never a throw), the host-misuse errors,
//! and the hostile-input cases the in-app PDF viewer makes interesting.

use super::*;
use crate::render::{pdf_err, PdfOutcome};
use shojiku_diagnostics::DiagnosticCode;

fn pdf(outcome: &PdfOutcome) -> &[u8] {
    &outcome.pdf
}

/// How many page objects the written PDF declares. One `/Type /Page` per
/// page; the page TREE node is `/Type /Pages`, whose count is subtracted
/// because the shorter needle is its prefix. Both spacings are matched, as
/// pdf-writer's differs by context (the render-pdf suite's idiom).
fn page_objects(bytes: &[u8]) -> usize {
    let content = String::from_utf8_lossy(bytes);
    let spaced = content.matches("/Type /Page").count() - content.matches("/Type /Pages").count();
    let tight = content.matches("/Type/Page").count() - content.matches("/Type/Pages").count();
    spaced + tight
}

#[test]
fn renders_pdf_bytes_with_one_page_object_per_page() {
    let session = ready_session();
    let outcome = session
        .render_pdf(&multipage_template(3), "{}", None)
        .expect("render");

    assert!(pdf(&outcome).starts_with(b"%PDF-"), "PDF header");
    assert_eq!(page_objects(pdf(&outcome)), 3);
    assert!(outcome.prepared.is_some());
    assert!(!outcome.diagnostics.has_errors());
}

#[test]
fn the_same_inputs_render_the_same_bytes() {
    // Determinism is the whole promise of rendering the deliverable client
    // side: the browser's PDF must be the CLI's PDF, so it must first be its
    // own PDF twice.
    let session = ready_session();
    let first = session.render_pdf(TEMPLATE, "{}", None).expect("first");
    let second = session.render_pdf(TEMPLATE, "{}", None).expect("second");

    assert_eq!(first.pdf, second.pdf);
}

#[test]
fn a_parse_error_renders_no_bytes_with_diagnostics() {
    let session = ready_session();
    let outcome = session
        .render_pdf("{{{ not yaml", "{}", None)
        .expect("a document problem is never a throw");

    assert!(outcome.pdf.is_empty());
    assert!(outcome.prepared.is_none());
    assert!(outcome
        .diagnostics
        .iter()
        .any(|d| d.code == DiagnosticCode::ParseError));
}

#[test]
fn a_validation_error_renders_no_bytes_with_diagnostics() {
    // An `image` item with neither `src` nor `data` is the cheapest
    // definitions-free ERROR-severity trigger.
    let template = concat!(
        "page: { margin: 0 }\n",
        "sections:\n",
        "  body:\n",
        "    type: flow\n",
        "    items:\n",
        "      - type: image\n",
        "        box: { w: 100, h: 100 }\n",
    );
    let session = ready_session();
    let outcome = session.render_pdf(template, "{}", None).expect("no throw");

    assert!(outcome.pdf.is_empty());
    assert!(outcome.prepared.is_none());
    assert!(outcome.diagnostics.has_errors());
}

#[test]
fn a_bare_session_names_the_setup_step_it_is_missing() {
    let bare = Session::new();
    assert!(matches!(
        bare.render_pdf(TEMPLATE, "{}", None),
        Err(WasmError::LocaleNotSet)
    ));

    let mut located = Session::new();
    located.set_locale("ja-JP", None).expect("locale");
    assert!(matches!(
        located.render_pdf(TEMPLATE, "{}", None),
        Err(WasmError::FontsNotLoaded)
    ));
}

#[test]
fn a_pdf_backend_failure_becomes_a_typed_render_error() {
    // The validate gate ahead of the backend rejects every layout the backend
    // itself refuses, so the mapping is pinned directly.
    let mapped = pdf_err(shojiku_render_pdf::RenderError::NoPages);
    assert_eq!(mapped.code(), "render_error");
    match mapped {
        WasmError::Render(detail) => assert!(detail.contains("no pages")),
        other => panic!("expected a render error, got {other:?}"),
    }
}

#[test]
fn a_hostile_link_scheme_never_reaches_the_written_pdf() {
    // The PDF is displayed IN the app (a blob URL in the browser's own
    // viewer), so a script-bearing link annotation would be a live surface.
    // Layout gates link schemes to http/https/mailto/tel — this pins that the
    // gate holds all the way to the bytes.
    let template = concat!(
        "page: { margin: 0 }\n",
        "sections:\n",
        "  body:\n",
        "    type: flow\n",
        "    items:\n",
        "      - type: text\n",
        "        text: click me\n",
        "        link: { url: \"javascript:alert(1)\" }\n",
    );
    let session = ready_session();
    let outcome = session.render_pdf(template, "{}", None).expect("renders");

    assert!(!outcome.pdf.is_empty());
    assert!(
        !contains(pdf(&outcome), b"javascript:"),
        "a rejected link scheme must not reach the PDF"
    );
    assert!(outcome
        .diagnostics
        .iter()
        .any(|d| d.code == DiagnosticCode::UnsupportedLinkScheme));
}

#[test]
fn a_hostile_document_name_does_not_crash_the_title_path() {
    // The document `name` becomes the PDF title (krilla metadata). It is
    // author-controlled, so control characters and length must degrade, never
    // panic.
    // Authored with YAML's own escapes: a control character at each end and
    // a long body, all through the double-quoted scalar the wire accepts.
    let name = format!("\\x07{}\\x00", "ま".repeat(4096));
    let template = format!(
        concat!(
            "name: \"{}\"\n",
            "page: {{ margin: 0 }}\n",
            "sections:\n",
            "  body:\n",
            "    type: flow\n",
            "    items:\n",
            "      - type: text\n",
            "        text: hi\n",
        ),
        name
    );
    let session = ready_session();
    let outcome = session.render_pdf(&template, "{}", None).expect("renders");

    assert!(pdf(&outcome).starts_with(b"%PDF-"));
}

#[test]
fn a_zero_page_size_is_a_parse_diagnostic_with_no_bytes() {
    // `size: { w: 0, h: 0 }` never reaches the PDF backend: the wire's parse
    // rejects the zero length, so the backend's own positive-size guard has no
    // authorable route to it (probed — the outcome is a `parse_error`
    // diagnostic). Pin that degraded output exactly: empty bytes, no prepared
    // document, the explaining diagnostic — and above all, no panic and no
    // throw.
    let template = concat!(
        "page: { size: { w: 0, h: 0 }, margin: 0 }\n",
        "sections:\n",
        "  body:\n",
        "    type: flow\n",
        "    items:\n",
        "      - type: text\n",
        "        text: hi\n",
    );
    let session = ready_session();
    let outcome = session
        .render_pdf(template, "{}", None)
        .expect("a document problem is never a throw");

    assert!(outcome.pdf.is_empty());
    assert!(outcome.prepared.is_none());
    assert!(outcome
        .diagnostics
        .iter()
        .any(|d| d.code == DiagnosticCode::ParseError));
}

/// Substring search over bytes (no dependency needed for one call site).
fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|w| w == needle)
}
