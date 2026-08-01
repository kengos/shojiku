//! Wire tests for `link:`: parse shapes, typo rejection, round-trip.

use crate::template::{parse_template, Body, Item};

fn flow_items(yaml: &str) -> Vec<Item> {
    let template = parse_template(yaml).expect("template");
    match template.sections.body {
        Body::Flow(flow) => flow.items,
        Body::Absolute(_) => panic!("expected flow body"),
    }
}

fn page_yaml(items: &str) -> String {
    format!("page: {{ size: A4 }}\nsections:\n  body:\n    type: flow\n    items:\n{items}")
}

#[test]
fn link_parses_on_text_image_and_span() {
    let items = flow_items(&page_yaml(concat!(
        "      - type: text\n",
        "        text: shop\n",
        "        link: { url: \"https://example.com\" }\n",
        "      - type: image\n",
        "        box: { w: 40, h: 40 }\n",
        "        src: logo.png\n",
        "        link: { url: \"{site}\" }\n",
        "      - type: text\n",
        "        spans:\n",
        "          - text: terms\n",
        "            link: { url: \"mailto:a@b.jp\" }\n",
    )));
    let Item::Text(text) = &items[0] else { panic!("text") };
    assert_eq!(text.link.as_ref().expect("link").url, "https://example.com");
    let Item::Image(image) = &items[1] else { panic!("image") };
    assert_eq!(image.link.as_ref().expect("link").url, "{site}");
    let Item::Text(rich) = &items[2] else { panic!("rich") };
    assert_eq!(
        rich.spans[0].link.as_ref().expect("link").url,
        "mailto:a@b.jp"
    );
}

#[test]
fn link_rejects_unknown_keys_and_bare_strings() {
    // Typo safety: an unknown key inside `link` is a parse error, and the
    // bare-string shorthand is deliberately not a second authored form.
    let typo = page_yaml(concat!(
        "      - type: text\n",
        "        text: x\n",
        "        link: { ulr: \"https://e.com\" }\n",
    ));
    assert!(parse_template(&typo).is_err());
    let bare = page_yaml(concat!(
        "      - type: text\n",
        "        text: x\n",
        "        link: \"https://e.com\"\n",
    ));
    assert!(parse_template(&bare).is_err());
}

#[test]
fn link_round_trips_and_unset_never_serializes() {
    let items = flow_items(&page_yaml(concat!(
        "      - type: text\n",
        "        text: a\n",
        "        link: { url: \"https://example.com\" }\n",
        "      - type: text\n",
        "        text: b\n",
    )));
    let linked = serde_yaml::to_string(&items[0]).expect("yaml");
    assert!(linked.contains("url: https://example.com"), "{linked}");
    let plain = serde_yaml::to_string(&items[1]).expect("yaml");
    assert!(!plain.contains("link"), "{plain}");
}
