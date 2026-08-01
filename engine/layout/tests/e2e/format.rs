//! Catalog/format integration end to end: definitions-driven
//! formatting and format_error fallback.

use crate::common::*;

mod enum_labels;

#[test]
fn interpolation_formats_currency_with_catalog() {
    let defs = parse_definitions(
        r#"
type: object
properties:
  amount:
    type: object
    properties:
      total:
        type: number
        format: currency
"#,
    )
    .expect("defs");
    let catalog = Catalog::from_definitions(&defs);
    let template = parse_template(
        r#"
page: { margin: 0 }
defaults:
  formats:
    currency: symbol
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        text: "合計 {amount.total} です"
"#,
    )
    .expect("template");
    let params = json!({"amount": {"total": 5000}});
    let pack = ja_pack();
    let fonts = ja_store();
    let input = LayoutInput {
        template: &template,
        params: &params,
        catalog: Some(&catalog),
        pack: &pack,
        fonts,
        assets: None,
    };
    let out = layout(&input);
    let (doc, diags) = (out.document, out.diagnostics);
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert!(all_text(&doc.pages[0]).contains("合計 ¥5,000 です"));
}

#[test]
fn a_symbol_pick_on_a_bare_number_renders_as_currency() {
    // No definitions at all (the workshop path): a `symbol` pick on a
    // plain params number coerces to currency through the pack chain —
    // the pick is honored, not warned.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        text: "合計 {amount:symbol} です"
"#,
        json!({"amount": 3200}),
    );
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert!(all_text(&doc.pages[0]).contains("¥3,200"));
}

#[test]
fn table_cells_format_with_catalog_specs() {
    let defs = parse_definitions(
        r#"
type: object
properties:
  order_items:
    type: array
    items:
      type: object
      properties:
        price:
          type: number
          format: currency
"#,
    )
    .expect("defs");
    let catalog = Catalog::from_definitions(&defs);
    let template = parse_template(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: table
        data: { key: order_items }
        columns:
          - data: { key: price, format: symbol }
            width: 200
"#,
    )
    .expect("template");
    let params = json!({"order_items": [{"price": 5000}]});
    let pack = ja_pack();
    let fonts = ja_store();
    let input = LayoutInput {
        template: &template,
        params: &params,
        catalog: Some(&catalog),
        pack: &pack,
        fonts,
        assets: None,
    };
    let out = layout(&input);
    let (doc, diags) = (out.document, out.diagnostics);
    assert!(diags.is_empty(), "unexpected diagnostics: {diags:?}");
    assert!(all_text(&doc.pages[0]).contains("¥5,000"));
}

#[test]
fn formatter_degradations_surface_as_distinct_warnings() {
    // One run hitting the three non-variant degradation codes: an
    // unlisted currency on the symbol form, an unknown semantic unit
    // key, and an inline pattern on a currency default.
    let defs = parse_definitions(
        r#"
type: object
properties:
  order:
    type: object
    properties:
      total:
        type: number
        format: currency
        currency: XYZ
      count:
        type: number
        format: quantity
        unit: crates
"#,
    )
    .expect("defs");
    let catalog = Catalog::from_definitions(&defs);
    let template = parse_template(
        r#"
page: { margin: 0 }
defaults:
  formats:
    currency: { pattern: "M/d" }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        data: { key: order.total, format: symbol }
      - type: text
        data: { key: order.total }
      - type: text
        data: { key: order.count }
"#,
    )
    .expect("template");
    let params = json!({"order": {"total": 12.3, "count": 4}});
    let pack = ja_pack();
    let fonts = ja_store();
    let input = LayoutInput {
        template: &template,
        params: &params,
        catalog: Some(&catalog),
        pack: &pack,
        fonts,
        assets: None,
    };
    let out = layout(&input);
    let codes: Vec<&str> = out.diagnostics.iter().map(|d| d.code.as_str()).collect();
    assert!(codes.contains(&"unknown_currency"), "got: {codes:?}");
    assert!(codes.contains(&"unknown_unit"), "got: {codes:?}");
    assert!(codes.contains(&"format_pattern_ignored"), "got: {codes:?}");
    // The values still rendered on their fallback forms.
    let text = all_text(&out.document.pages[0]);
    assert!(text.contains("XYZ 12.30"), "got: {text}");
    assert!(text.contains("4crates"), "got: {text}");
}

#[test]
fn format_error_warns_and_renders_raw_value() {
    let defs = parse_definitions(
        r#"
type: object
properties:
  order:
    type: object
    properties:
      when:
        type: string
        format: date-time
      count:
        type: string
        format: date-time
"#,
    )
    .expect("defs");
    let catalog = Catalog::from_definitions(&defs);
    let template = parse_template(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 400, h: 600 }
    items:
      - type: text
        data: { key: order.when }
      - type: text
        data: { key: order.count }
"#,
    )
    .expect("template");
    let params = json!({"order": {"when": "not-a-date", "count": 7}});
    let pack = ja_pack();
    let fonts = ja_store();
    let input = LayoutInput {
        template: &template,
        params: &params,
        catalog: Some(&catalog),
        pack: &pack,
        fonts,
        assets: None,
    };
    let out = layout(&input);
    let (doc, diags) = (out.document, out.diagnostics);
    assert_eq!(diags.iter().filter(|d| d.code == "format_error").count(), 2);
    let text = all_text(&doc.pages[0]);
    assert!(text.contains("not-a-date"));
    assert!(text.contains('7'));
}
