//! Which format wins, what a declared placeholder covers, what a
//! declaration deliberately does NOT touch (`data:`), and the regression
//! pins that undeclared interpolation is byte-for-byte unchanged.

use crate::common::*;

fn one_date(items: &str) -> (LayoutDocument, Diagnostics) {
    run(
        &format!(
            r#"
page: {{ margin: 0 }}
defaults:
  locale: ja-JP
  style: {{ fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0 }}
sections:
  body:
    type: absolute
    items:
{items}
"#
        ),
        json!({ "d": "1993-04-10" }),
    )
}

#[test]
fn a_declaration_format_applies_and_an_inline_format_overrides_it() {
    // Four renders of ONE value, so the assertions compare variants
    // instead of hard-coding locale strings:
    //   0 declaration `format: wareki`      1 the same variant, undeclared
    //   2 inline `:date` over the wareki    3 the same variant, undeclared
    let (doc, diags) = one_date(
        "      - type: text\n        box: { x: 0, y: 0, w: 300 }\n        text: \"{n}\"\n        bindings:\n          n: { key: d, format: wareki }\n\
         \x20     - type: text\n        box: { x: 0, y: 20, w: 300 }\n        text: \"{d:wareki}\"\n\
         \x20     - type: text\n        box: { x: 0, y: 40, w: 300 }\n        text: \"{n:date}\"\n        bindings:\n          n: { key: d, format: wareki }\n\
         \x20     - type: text\n        box: { x: 0, y: 60, w: 300 }\n        text: \"{d:date}\"\n",
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    let t: Vec<String> = text_blocks(&doc.pages[0])
        .into_iter()
        .map(|b| b.lines[0].text.clone())
        .collect();
    // The declaration's format really applied…
    assert_eq!(t[0], t[1], "declared format != the same variant inline");
    // …and the inline one overrode it, landing on the OTHER variant.
    assert_eq!(t[2], t[3], "inline override != a plain `:date`");
    assert_ne!(t[0], t[2], "the two variants must differ: {t:?}");
}

#[test]
fn a_declared_placeholder_covers_a_blank_but_not_an_invalid_value() {
    let blank = r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 0, y: 0, w: 300, h: 20 }
        text: "{n}"
        bindings:
          n: { key: d, format: date, placeholder: "　年　月　日" }
"#;
    let (doc, diags) = run(blank, json!({}));
    assert!(diags.is_empty(), "expected clean: {diags:?}");
    assert_eq!(all_text(&doc.pages[0]), "　年　月　日");
    // A garbage date is a DATA BUG, not a blank field: the placeholder
    // must not mask it.
    let (_doc, diags) = run(blank, json!({ "d": "not-a-date" }));
    assert!(
        diags.iter().any(|d| d.code == "format_error"),
        "invalid value must still warn under a placeholder: {diags:?}"
    );
}

#[test]
fn a_missing_declared_key_is_reported_under_that_key() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 0, y: 0, w: 300, h: 20 }
        text: "x{n}y"
        bindings:
          n: { key: ghost }
"#,
        json!({ "n": "decoy" }),
    );
    // The decoy proves the REFERENCE name is never used as a key.
    assert_eq!(all_text(&doc.pages[0]), "xy");
    assert_eq!(diags.items[0].code, "missing_data", "{diags:?}");
    assert!(diags.items[0].message.contains("ghost"), "{diags:?}");
}

#[test]
fn a_data_binding_never_resolves_through_the_declaration_map() {
    // Declared names and `data.key` are separate namespaces: `data:`
    // already carries every option, so it must ignore a same-named entry.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 0, y: 0, w: 300, h: 20 }
        data: { key: real }
        bindings:
          real: { key: other }
          used: { key: real }
        style: { fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "real": "R", "other": "O" }),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(all_text(&doc.pages[0]), "R");
}

#[test]
fn undeclared_interpolation_is_unchanged() {
    // The regression pin: with no `bindings:` anywhere, resolution and
    // placement are exactly what they were before declarations existed —
    // including a non-ASCII key still printing its braces verbatim, with
    // NO diagnostic from layout (the charset warning is validate-side).
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        box: { x: 10, y: 20, w: 300 }
        text: "code {order.code} / {品名}"
        style: { fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.0 }
"#,
        json!({ "order": { "code": "A-1" }, "品名": "特上弁当" }),
    );
    assert!(diags.is_empty(), "layout must stay silent: {diags:?}");
    let block = &text_blocks(&doc.pages[0])[0];
    assert_eq!(block.lines[0].text, "code A-1 / {品名}");
    assert_eq!((block.lines[0].x, block.lines[0].y), (10.0, 20.0));
}
