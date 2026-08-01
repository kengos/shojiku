//! The URL gate end to end: hostile schemes/params, size caps, empties,
//! and links inside clip groups.

use crate::common::*;

fn linked_text(url_yaml: &str) -> String {
    format!(
        "page: {{ margin: 0 }}\nsections:\n  body:\n    type: flow\n    box: {{ x: 0, y: 0, w: 400, h: 400 }}\n    items:\n      - type: text\n        text: shop\n        link: {{ url: {url_yaml} }}\n"
    )
}

fn dropped_with(template: &str, params: Value, code: &str) {
    let (doc, diags) = run(template, params);
    assert!(
        diags.items.iter().any(|d| d.code == code),
        "expected {code}: {diags:?}"
    );
    assert_eq!(text_blocks(&doc.pages[0])[0].link, None, "link must drop");
}

#[test]
fn hostile_scheme_via_params_is_dropped() {
    // The URL is params-controlled: a template interpolating `{u}` must
    // not let untrusted data smuggle a non-allowlisted scheme through.
    dropped_with(
        &linked_text("\"{u}\""),
        json!({ "u": "javascript:alert(1)" }),
        "unsupported_link_scheme",
    );
    dropped_with(
        &linked_text("\"{u}\""),
        json!({ "u": "file:///etc/passwd" }),
        "unsupported_link_scheme",
    );
}

#[test]
fn static_file_url_is_dropped() {
    dropped_with(
        &linked_text("\"file:///C:/secrets.txt\""),
        json!({}),
        "unsupported_link_scheme",
    );
}

#[test]
fn oversized_url_is_dropped() {
    let huge = format!("https://example.com/{}", "a".repeat(3000));
    dropped_with(
        &linked_text("\"{u}\""),
        json!({ "u": huge }),
        "link_url_too_long",
    );
}

#[test]
fn empty_interpolated_url_is_dropped() {
    dropped_with(
        &linked_text("\"{u}\""),
        json!({ "u": "" }),
        "empty_link_url",
    );
}

#[test]
fn clipped_text_keeps_its_link_and_decoration_stays_linkless() {
    // `textOverflow: clip` wraps the block in a clip node; the link must
    // reach through to the block inside it. The `backgroundColor` adds a
    // decoration rect beside the clip — a shape the link walk skips (the
    // line rects are the activation area, not the box fill).
    let (doc, _diags) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 400 }
    items:
      - type: text
        text: "aaa aaa aaa aaa aaa"
        box: { w: 40, h: 12 }
        link: { url: "https://example.com" }
        style: { fontSize: 10, lineHeight: 1.0, textOverflow: clip, backgroundColor: "#eeeeee" }
"##,
        json!({}),
    );
    assert_eq!(rect_shapes(&doc.pages[0]).len(), 1, "decoration rect");
    let clip = crate::clip::only_clip(&doc.pages[0]);
    let LayoutItem::Text(block) = &clip.items[0] else {
        panic!("expected clipped text");
    };
    assert_eq!(block.link.as_deref(), Some("https://example.com"));
    // And the flat helper proves the block moved inside the clip.
    assert!(text_blocks(&doc.pages[0]).is_empty());
}
