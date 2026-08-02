//! Named page-size presets: dimensions, parse, round-trip, rejection.

use super::*;

#[test]
fn named_sizes_have_expected_dimensions() {
    // ISO A, JIS B (182×257 / 257×364mm — not ISO B), North American.
    let cases = [
        (PageSize::A3, (841.89, 1190.55)),
        (PageSize::A4, (595.28, 841.89)),
        (PageSize::A5, (419.53, 595.28)),
        (PageSize::B4, (728.5, 1031.81)),
        (PageSize::B5, (515.91, 728.5)),
        (PageSize::Letter, (612.0, 792.0)),
        (PageSize::Legal, (612.0, 1008.0)),
        (PageSize::Tabloid, (792.0, 1224.0)),
    ];
    for (size, expected) in cases {
        assert_eq!(size.dimensions_pt(), expected, "{size:?}");
    }
}

#[test]
fn named_sizes_parse_and_round_trip() {
    for name in ["A3", "A5", "B4", "B5", "Legal", "Tabloid"] {
        let yaml =
            format!("page:\n  size: {name}\nsections:\n  body:\n    type: flow\n    items: []\n");
        let tpl = parse_template(&yaml).expect("named size should parse");
        let out = serde_yaml::to_string(&tpl.page).expect("serialize");
        assert!(out.contains(&format!("size: {name}")), "{out}");
    }
}

#[test]
fn landscape_swaps_named_size_dimensions() {
    let tpl = parse_template(
        "page:\n  size: A3\n  orientation: landscape\nsections:\n  body:\n    type: flow\n    items: []\n",
    )
    .expect("parse");
    assert_eq!(tpl.page.dimensions_pt(), (1190.55, 841.89));
    // A named size + landscape is a legitimate combination, not ignored.
    assert!(!tpl.page.orientation_ignored());
}

#[test]
fn custom_size_ignores_orientation_landscape() {
    // A custom `{ w, h }` states its dimensions literally; `orientation:
    // landscape` on top must NOT double-swap it back to portrait.
    let tpl = parse_template(
        "page:\n  size: { w: 400, h: 200 }\n  orientation: landscape\n\
         sections:\n  body:\n    type: flow\n    items: []\n",
    )
    .expect("parse");
    assert_eq!(tpl.page.dimensions_pt(), (400.0, 200.0));
    assert!(tpl.page.orientation_ignored());
}

#[test]
fn custom_size_without_orientation_is_not_ignored() {
    let tpl = parse_template(
        "page:\n  size: { w: 400, h: 200 }\nsections:\n  body:\n    type: flow\n    items: []\n",
    )
    .expect("parse");
    assert_eq!(tpl.page.dimensions_pt(), (400.0, 200.0));
    assert!(!tpl.page.orientation_ignored());
}

#[test]
fn unknown_size_name_lists_the_presets() {
    let err =
        parse_template("page:\n  size: B6\nsections:\n  body:\n    type: flow\n    items: []\n")
            .expect_err("unknown name must reject");
    let msg = err.to_string();
    assert!(msg.contains("B4/B5 (JIS)"), "{msg}");
    assert!(msg.contains("Tabloid"), "{msg}");
}
