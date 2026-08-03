//! Style cascade end to end: inheritance through containers, named
//! styles, and backgroundColor.

use crate::common::*;

mod font_family;
mod numeric_caps;

#[test]
fn container_line_break_is_inherited_and_overridable() {
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: container
        style: { lineBreak: anywhere }
        items:
          - type: text
            text: "ああ。あ"
            box: { w: 25 }
            style: { fontSize: 10 }
          - type: text
            text: "ああ。あ"
            box: { w: 25 }
            style: { fontSize: 10, lineBreak: normal }
      - type: text
        text: "ああ。あ"
        box: { w: 25 }
        style: { fontSize: 10 }
"#,
        json!({}),
    );
    let blocks = text_blocks(&doc.pages[0]);
    // Child inherits the container's `anywhere` — no kinsoku.
    assert_eq!(line_texts(blocks[0]), vec!["ああ", "。あ"]);
    // Sibling overrides back to `normal` — kinsoku applies.
    assert_eq!(line_texts(blocks[1]), vec!["あ", "あ。あ"]);
    // After the container, the inherited value is restored to the root
    // default (`normal`), so this top-level sibling gets kinsoku.
    assert_eq!(line_texts(blocks[2]), vec!["あ", "あ。あ"]);
}

#[test]
fn line_break_inherits_through_an_unset_container() {
    // Middle container has no `lineBreak`, so the inner text still sees
    // the outer container's `anywhere` (unwrap_or keeps the inherited).
    let (doc, _) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: container
        style: { lineBreak: anywhere }
        items:
          - type: container
            items:
              - type: text
                text: "ああ。あ"
                box: { w: 25 }
                style: { fontSize: 10 }
"#,
        json!({}),
    );
    let blocks = text_blocks(&doc.pages[0]);
    assert_eq!(line_texts(blocks[0]), vec!["ああ", "。あ"]);
}

#[test]
fn container_style_inherits_font_and_color_then_restores() {
    // A container sets inherited properties (fontSize, color) that flow
    // to a child which sets neither; a sibling after the container is
    // unaffected (the cascade is restored). verticalAlign is NOT
    // inherited, so it never leaks — covered by style.rs unit tests.
    let (doc, _) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: container
        style: { fontSize: 22, color: "#ff0000" }
        items:
          - type: text
            text: inherited
      - type: text
        text: outside
"##,
        json!({}),
    );
    let blocks = text_blocks(&doc.pages[0]);
    // Child inherits both from the container.
    assert_eq!(blocks[0].font_size, 22.0);
    assert_eq!(blocks[0].color, (1.0, 0.0, 0.0));
    // Sibling after the container falls back to the engine defaults.
    assert_eq!(blocks[1].font_size, 10.0);
    assert_eq!(blocks[1].color, (0.0, 0.0, 0.0));
}

#[test]
fn font_variant_and_letter_spacing_inherit_through_a_container() {
    // fontWeight / fontStyle / letterSpacing are inherited properties:
    // set on a container, they reach a child that sets none of them, and
    // a sibling outside the container is restored to the defaults.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: container
        style: { fontWeight: bold, fontStyle: italic, letterSpacing: 2 }
        items:
          - type: text
            text: inherited
      - type: text
        text: outside
"#,
        json!({}),
    );
    assert!(!diags.has_errors());
    let blocks = text_blocks(&doc.pages[0]);
    // Inherited bold selects the default family's real bold face (so
    // synthetic bold is off); italic has no real face and stays synthetic;
    // letterSpacing reaches the child too.
    assert_eq!(blocks[0].font_id, "biz-udp-gothic-bold");
    assert!(!blocks[0].synthetic_bold);
    assert!(blocks[0].synthetic_italic);
    assert_eq!(blocks[0].letter_spacing, 2.0);
    // The sibling outside the container is restored to the defaults.
    assert_eq!(blocks[1].font_id, "biz-udp-gothic");
    assert!(!blocks[1].synthetic_bold);
    assert!(!blocks[1].synthetic_italic);
    assert_eq!(blocks[1].letter_spacing, 0.0);
}

#[test]
fn inherited_hostile_font_size_is_clamped_on_the_computed_value() {
    // A non-positive fontSize set on a container flows to a child that
    // never sets it; the sanity clamp must still fire on the *computed*
    // value, not just on an inline one.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 500 }
    items:
      - type: container
        style: { fontSize: -5 }
        items:
          - type: text
            text: hi
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "invalid_font_size"));
    let blocks = text_blocks(&doc.pages[0]);
    assert_eq!(blocks[0].font_size, 10.0);
}

#[test]
fn named_styles_layer_in_order_below_inline() {
    // styleNames apply in listed order (later wins), and the inline
    // `style` still beats both. `muted` sets fontSize 8; `big` overrides
    // to 30; inline overrides fontSize again to 12 but keeps big's color.
    let (doc, _) = run(
        r##"
styles:
  muted: { fontSize: 8, color: "#0000ff" }
  big: { fontSize: 30, color: "#00ff00" }
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: layered
        styleNames: [muted, big]
        style: { fontSize: 12 }
"##,
        json!({}),
    );
    let blocks = text_blocks(&doc.pages[0]);
    assert_eq!(blocks[0].font_size, 12.0); // inline beat both named
    assert_eq!(blocks[0].color, (0.0, 1.0, 0.0)); // big beat muted, inline unset
}

#[test]
fn undefined_style_name_is_a_layout_no_op() {
    // Layout skips an unknown styleName silently (validate reports it);
    // the item just renders with its inline/default style.
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: hi
        styleNames: [does_not_exist]
        style: { fontSize: 18 }
"#,
        json!({}),
    );
    // No warning from layout (validate owns that), and the inline style
    // still applies despite the unknown name.
    assert!(diags.items.is_empty(), "unexpected diagnostics: {diags:?}");
    assert_eq!(text_blocks(&doc.pages[0])[0].font_size, 18.0);
}

#[test]
fn background_color_emits_a_fill_rect_under_the_text() {
    let (doc, _) = run(
        r##"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: hi
        box: { x: 10, y: 0, w: 80, h: 40 }
        style: { backgroundColor: "#ff0000" }
"##,
        json!({}),
    );
    let rects = rect_shapes(&doc.pages[0]);
    let bg = rects
        .iter()
        .find(|r| r.fill == Some((1.0, 0.0, 0.0)))
        .expect("bg rect");
    assert_eq!(bg.x, 10.0);
    assert_eq!(bg.w, 80.0);
    assert!(bg.stroke.is_none());
    // The fill rect precedes the text in draw order.
    let first = &doc.pages[0].items[0];
    assert!(matches!(first, LayoutItem::Rect(_)));
}

#[test]
fn invalid_background_color_warns_and_draws_no_fill() {
    let (doc, diags) = run(
        r#"
page: { margin: 0 }
sections:
  body:
    type: absolute
    items:
      - type: text
        text: hi
        box: { x: 0, y: 0, w: 50, h: 20 }
        style: { backgroundColor: "not-a-color" }
"#,
        json!({}),
    );
    assert!(diags.iter().any(|d| d.code == "invalid_color"));
    // No rect emitted — only the text block.
    assert!(rect_shapes(&doc.pages[0]).is_empty());
}
