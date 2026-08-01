//! Whether a declaration is actually used, whether its name can be
//! written as `{name}` at all, whether it silently redirects a name that
//! already resolved, and the per-item cap.

use super::*;
use crate::template::MAX_BINDINGS;

/// One flow item declaring `n: { key: store }`, with `body` supplying the
/// item's own lines (already indented for `tpl`).
fn item(body: &str) -> Template {
    tpl(&format!(
        "{body}        bindings:\n          n: {{ key: store }}\n"
    ))
}

#[test]
fn an_unused_declaration_is_reported() {
    let template = item("      - type: text\n        text: no interpolation here\n");
    let diags = validate(Some(&jdefs()), &template, None);
    let found = find(&diags, "unused_binding");
    assert_eq!(found.len(), 1, "{diags:?}");
    assert_eq!(
        found[0].path.as_deref(),
        Some("sections.body.items[0].bindings.n")
    );
}

#[test]
fn a_declaration_used_from_a_text_item_or_its_link_is_not_reported() {
    // (a) the item's own text
    let by_text = item("      - type: text\n        text: \"hello {n}\"\n");
    // (c) the item's link URL
    let by_url = item(
        "      - type: text\n        text: t\n        link: { url: \"https://x.test/{n}\" }\n",
    );
    for (label, template) in [("text", by_text), ("link.url", by_url)] {
        let diags = validate(Some(&jdefs()), &template, None);
        assert!(
            find(&diags, "unused_binding").is_empty(),
            "{label}: {diags:?}"
        );
    }
}

#[test]
fn a_declaration_used_from_a_span_or_its_link_is_not_reported() {
    // Spans resolve through the OWNING item's map, so using a name from a
    // span (b) or a span link (d) counts as use.
    let by_span = item("      - type: text\n        spans:\n          - text: \"{n}\"\n");
    let by_span_url = item(concat!(
        "      - type: text\n",
        "        spans:\n",
        "          - text: t\n",
        "            link: { url: \"https://x.test/{n}\" }\n",
    ));
    for (label, template) in [("span.text", by_span), ("span.link.url", by_span_url)] {
        let diags = validate(Some(&jdefs()), &template, None);
        assert!(
            find(&diags, "unused_binding").is_empty(),
            "{label}: {diags:?}"
        );
    }
}

#[test]
fn a_declaration_used_from_qr_char_grid_image_or_list_is_not_reported() {
    // (e) qr text, (f) char_grid text, (g) list entry text, plus an
    // image's link URL — every carrier of a declaration map.
    let qr = item("      - type: qr_code\n        box: { w: 40, h: 40 }\n        text: \"{n}\"\n");
    let grid = item(concat!(
        "      - type: char_grid\n",
        "        grid: { charsPerLine: 4, lines: 1 }\n",
        "        text: \"{n}\"\n",
    ));
    let image = item(concat!(
        "      - type: image\n",
        "        box: { w: 20, h: 20 }\n",
        "        src: logo.png\n",
        "        link: { url: \"https://x.test/{n}\" }\n",
    ));
    // A list's element-scoped declaration is not key-checked (entry
    // shapes are unmodelled), but "used" still reads its entry template.
    let list = tpl(concat!(
        "      - type: list\n",
        "        data: { key: rows }\n",
        "        text: \"{n}\"\n",
        "        bindings:\n",
        "          n: { key: name }\n",
    ));
    for (label, template) in [
        ("qr_code", qr),
        ("char_grid", grid),
        ("image.link.url", image),
        ("list", list),
    ] {
        let diags = validate(Some(&jdefs()), &template, None);
        assert!(
            find(&diags, "unused_binding").is_empty(),
            "{label}: {diags:?}"
        );
    }
}

#[test]
fn a_declaration_redirecting_an_existing_name_warns_that_it_shadows() {
    // `store` already resolves; the declaration silently sends it to a
    // different key.
    let template = tpl(r#"      - type: text
        text: "{store}"
        bindings:
          store: { key: 品名 }
"#);
    let diags = validate(Some(&jdefs()), &template, None);
    let found = find(&diags, "binding_shadows_key");
    assert_eq!(found.len(), 1, "{diags:?}");
    assert_eq!(
        found[0].path.as_deref(),
        Some("sections.body.items[0].bindings.store")
    );
}

#[test]
fn a_cell_declaration_escaping_a_row_field_of_the_same_name_warns() {
    // `store` is BOTH a row field and a top-level scalar: inside the cell
    // `{store}` reads the row, and the declaration flips it to the
    // document without changing the spelling.
    let template = in_cell(
        r#"            - type: text
              text: "{store}"
              bindings:
                store: { key: store, scope: document }"#,
    );
    let diags = validate(Some(&jdefs()), &template, None);
    assert_eq!(find(&diags, "binding_shadows_key").len(), 1, "{diags:?}");
}

#[test]
fn attaching_options_to_the_ambient_key_does_not_warn() {
    // Same key, same scope — nothing is redirected, so there is nothing
    // ambiguous to report.
    let template = tpl(r#"      - type: text
        text: "{total}"
        bindings:
          total: { key: total, format: currency }
"#);
    let diags = validate(Some(&jdefs()), &template, None);
    assert!(find(&diags, "binding_shadows_key").is_empty(), "{diags:?}");
    // The same declaration is silent inside a cell, where `total` is not
    // a row field at all.
    let cell = in_cell(
        r#"            - type: text
              text: "{n}"
              bindings:
                n: { key: name }"#,
    );
    let diags = validate(Some(&jdefs()), &cell, None);
    assert!(find(&diags, "binding_shadows_key").is_empty(), "{diags:?}");
}

#[test]
fn shadowing_needs_definitions_and_is_skipped_for_entry_scoped_items() {
    // Without a catalog there is no "already resolves" to compare against.
    let template = tpl(r#"      - type: text
        text: "{store}"
        bindings:
          store: { key: 品名 }
"#);
    let diags = validate(None, &template, None);
    assert!(find(&diags, "binding_shadows_key").is_empty(), "{diags:?}");
    // A `list`'s `{name}` reads ENTRY fields, which definitions do not
    // model — so a same-named top-level scalar proves nothing.
    let list = tpl(concat!(
        "      - type: list\n",
        "        data: { key: rows }\n",
        "        text: \"{store}\"\n",
        "        bindings:\n",
        "          store: { key: 品名 }\n",
    ));
    let diags = validate(Some(&jdefs()), &list, None);
    assert!(find(&diags, "binding_shadows_key").is_empty(), "{diags:?}");
}

#[test]
fn a_name_outside_the_reference_charset_is_reported_and_not_called_unused() {
    let template = tpl(r#"      - type: text
        text: static
        bindings:
          品名: { key: 品名 }
"#);
    let diags = validate(Some(&jdefs()), &template, None);
    let found = find(&diags, "invalid_binding_name");
    assert_eq!(found.len(), 1, "{diags:?}");
    assert!(found[0].message.contains("品名"), "{diags:?}");
    // The sharper message stands alone: "unused" would only repeat it.
    assert!(find(&diags, "unused_binding").is_empty(), "{diags:?}");
}

#[test]
fn the_declaration_cap_warns_only_past_it() {
    let build = |count: usize| {
        let refs: String = (0..count).map(|i| format!("{{b{i}}}")).collect();
        let decls: String = (0..count)
            .map(|i| format!("          b{i}: {{ key: store }}\n"))
            .collect();
        tpl(&format!(
            "      - type: text\n        text: \"{refs}\"\n        bindings:\n{decls}"
        ))
    };
    // Exactly at the cap is silent — the boundary value the clamp admits.
    let diags = validate(Some(&jdefs()), &build(MAX_BINDINGS), None);
    assert!(find(&diags, "too_many_bindings").is_empty(), "{diags:?}");
    let diags = validate(Some(&jdefs()), &build(MAX_BINDINGS + 1), None);
    let found = find(&diags, "too_many_bindings");
    assert_eq!(found.len(), 1, "{diags:?}");
    assert!(
        found[0].message.contains(&(MAX_BINDINGS + 1).to_string()),
        "{diags:?}"
    );
}
