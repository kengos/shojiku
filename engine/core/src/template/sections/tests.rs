//! [`Body::items`]: a flow body and an absolute body each give their
//! top-level items, which [`Sections::item_lists`] places between the bands.

use crate::template::{parse_template, ItemKind};

fn body_kinds(body: &str) -> Vec<ItemKind> {
    let yaml = format!("sections:\n  body:\n{body}");
    let template = parse_template(&yaml).unwrap_or_else(|e| panic!("{yaml}: {e}"));
    template
        .sections
        .body
        .items()
        .iter()
        .map(|i| i.kind())
        .collect()
}

#[test]
fn either_kind_of_body_gives_its_top_level_items() {
    let flow = body_kinds("    type: flow\n    items: [{ type: text }, { type: page_break }]\n");
    assert_eq!(flow, [ItemKind::Text, ItemKind::PageBreak]);
    let absolute = body_kinds("    type: absolute\n    items: [{ type: page_number }]\n");
    assert_eq!(absolute, [ItemKind::PageNumber]);
}

#[test]
fn item_lists_places_the_body_between_the_bands() {
    let yaml = "sections:\n  header: { items: [{ type: text }] }\n  body:\n    type: absolute\n    items: [{ type: page_number }]\n  footer: { items: [] }\n";
    let template = parse_template(yaml).expect("template");
    let lists = template.sections.item_lists();
    let prefixes: Vec<&str> = lists.iter().map(|(p, _)| *p).collect();
    assert_eq!(
        prefixes,
        [
            "sections.header.items",
            "sections.body.items",
            "sections.footer.items"
        ]
    );
    assert_eq!(lists[1].1[0].kind(), ItemKind::PageNumber);
}
