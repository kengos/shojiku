//! Span-level links: per-run marking, block fallback, span override,
//! and the no-fallback rule for rejected span links.

use crate::common::*;

fn rich_page(spans: &str, block_link: &str) -> String {
    format!(
        "page: {{ margin: 0 }}\nsections:\n  body:\n    type: flow\n    box: {{ x: 0, y: 0, w: 400, h: 400 }}\n    items:\n      - type: text\n{block_link}        spans:\n{spans}        style: {{ fontSize: 10, lineHeight: 1.0 }}\n"
    )
}

#[test]
fn span_link_marks_only_its_runs() {
    let (doc, diags) = run(
        &rich_page(
            "          - text: \"see \"\n          - text: terms\n            link: { url: \"https://example.com/terms\" }\n",
            "",
        ),
        json!({}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let block = text_blocks(&doc.pages[0])[0];
    assert_eq!(block.link, None, "rich links ride runs, not the block");
    let runs = &block.lines[0].runs;
    assert_eq!(runs[0].link, None);
    assert_eq!(runs[1].link.as_deref(), Some("https://example.com/terms"));
}

#[test]
fn block_link_reaches_every_run() {
    let (doc, _diags) = run(
        &rich_page(
            "          - text: bold\n            style: { fontWeight: bold }\n          - text: plain\n",
            "        link: { url: \"https://example.com\" }\n",
        ),
        json!({}),
    );
    let block = text_blocks(&doc.pages[0])[0];
    for run in &block.lines[0].runs {
        assert_eq!(run.link.as_deref(), Some("https://example.com"));
    }
}

#[test]
fn span_link_overrides_block_link() {
    let (doc, _diags) = run(
        &rich_page(
            "          - text: home\n          - text: terms\n            link: { url: \"https://example.com/terms\" }\n",
            "        link: { url: \"https://example.com\" }\n",
        ),
        json!({}),
    );
    let runs = &text_blocks(&doc.pages[0])[0].lines[0].runs;
    assert_eq!(runs[0].link.as_deref(), Some("https://example.com"));
    assert_eq!(runs[1].link.as_deref(), Some("https://example.com/terms"));
}

#[test]
fn rejected_span_link_does_not_fall_back_to_the_block() {
    // The span authored its own link; dropping it must not silently
    // re-route the click to the block URL the author didn't intend.
    let (doc, diags) = run(
        &rich_page(
            "          - text: bad\n            link: { url: \"javascript:alert(1)\" }\n",
            "        link: { url: \"https://example.com\" }\n",
        ),
        json!({}),
    );
    assert!(diags
        .items
        .iter()
        .any(|d| d.code == "unsupported_link_scheme"));
    let runs = &text_blocks(&doc.pages[0])[0].lines[0].runs;
    assert_eq!(runs[0].link, None);
}
