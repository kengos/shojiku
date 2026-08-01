//! Every surface a declaration map serves: a text item and its spans,
//! both link URLs, an image link, a qr_code, a char_grid and a list's
//! per-entry template. The bound key is NON-ASCII throughout — the case
//! the bare `{key}` grammar cannot express at all, so a passing
//! assertion can only come from the declaration.

use crate::common::*;

fn params() -> Value {
    json!({ "品名": "特上弁当", "slug": "a1" })
}

#[test]
fn a_text_item_and_its_spans_resolve_a_declared_non_ascii_key() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 0, y: 0, w: 300 }
        text: "plain {n}"
        bindings:
          n: { key: 品名 }
        style: { fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0 }
      - type: text
        box: { x: 0, y: 20, w: 300 }
        spans:
          - text: "span "
          - text: "{n}"
        bindings:
          n: { key: 品名 }
        style: { fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0 }
"#,
        params(),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let page = &doc.pages[0];
    assert_eq!(text_blocks(page)[0].lines[0].text, "plain 特上弁当");
    // The span resolved through the OWNING item's map — spans have none.
    assert_eq!(text_blocks(page)[1].lines[0].text, "span 特上弁当");
}

#[test]
fn item_and_span_link_urls_resolve_a_declared_name() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 0, y: 0, w: 300 }
        text: block
        link: { url: "https://example.com/{n}" }
        bindings:
          n: { key: slug }
        style: { fontSize: 10, lineHeight: 1.0 }
      - type: text
        box: { x: 0, y: 20, w: 300 }
        spans:
          - text: run
            link: { url: "https://example.com/s/{n}" }
        bindings:
          n: { key: slug }
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        params(),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let blocks = text_blocks(&doc.pages[0]);
    assert_eq!(blocks[0].link.as_deref(), Some("https://example.com/a1"));
    // A rich link rides its run, not the block.
    let runs = &blocks[1].lines[0].runs;
    assert_eq!(runs[0].link.as_deref(), Some("https://example.com/s/a1"));
}

#[test]
fn an_image_link_url_resolves_a_declared_name() {
    let (doc, diags) = run_with_assets(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: image
        box: { x: 0, y: 0, w: 20, h: 20 }
        src: logo.png
        link: { url: "https://example.com/{n}" }
        bindings:
          n: { key: slug }
"#,
        params(),
        Some(&test_assets()),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(
        image_shapes(&doc.pages[0])[0].link.as_deref(),
        Some("https://example.com/a1")
    );
}

/// A qr_code carrying `text: "{n}"` declared to read `key`.
fn qr_yaml(key: &str) -> String {
    format!(
        r#"
page: {{ margin: 0 }}
sections:
  body:
    type: absolute
    items:
      - type: qr_code
        box: {{ x: 0, y: 0, w: 60, h: 60 }}
        text: "{{n}}"
        bindings:
          n: {{ key: {key} }}
"#
    )
}

#[test]
fn a_qr_code_encodes_through_its_declaration() {
    // A qr draws modules, not text, so prove the path two ways: it
    // encodes the declared non-ASCII key cleanly…
    let (doc, diags) = run(&qr_yaml("品名"), params());
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert!(
        !rect_shapes(&doc.pages[0]).is_empty(),
        "no qr modules were drawn"
    );
    // …and a MISSING key is reported under the DECLARATION's key, which
    // is only reachable if the content went through the declaration.
    let (_doc, diags) = run(&qr_yaml("ghost"), params());
    assert_eq!(diags.items[0].code, "missing_data", "{diags:?}");
    assert!(diags.items[0].message.contains("ghost"), "{diags:?}");
}

#[test]
fn a_char_grid_fills_cells_from_its_declaration() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: char_grid
        box: { x: 0, y: 0, w: 200, h: 40 }
        grid: { charsPerLine: 4, lines: 1, cellSize: 12 }
        text: "{n}"
        bindings:
          n: { key: 品名 }
        style: { fontFamily: biz-ud-gothic, fontSize: 10 }
"#,
        params(),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    // Every cell is its own one-char line, so assert a single character.
    let text = all_text(&doc.pages[0]);
    assert!(text.contains('特'), "got: {text}");
    assert!(text.contains('当'), "got: {text}");
}

#[test]
fn a_list_entry_template_resolves_a_declared_name() {
    // Also the entry-scope case of the document escape: `{shop}` reads
    // top-level params from inside a per-entry template.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: list
        box: { x: 0, y: 0, w: 300, h: 60 }
        data: { key: entries }
        text: "{label} / {shop}"
        bindings:
          shop: { key: 品名, scope: document }
        style: { fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "品名": "特上弁当", "entries": [{ "label": "A" }, { "label": "B" }] }),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let block = &text_blocks(&doc.pages[0])[0];
    assert_eq!(line_texts(block), vec!["A / 特上弁当", "B / 特上弁当"]);
}
