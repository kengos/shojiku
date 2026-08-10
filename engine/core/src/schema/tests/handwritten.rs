//! The hand-written schemas, pinned against the real parser.
//!
//! Each case has BOTH clauses: every form the schema declares parses, and at
//! least one form it does not declare is refused. Only the first clause
//! catches a schema that is too NARROW; only the second catches one that is
//! too WIDE, and a catalog that is too wide is the one that teaches an agent
//! to emit input the engine rejects.

use super::{pin, schema_of};
use crate::{
    BorderColor, BorderStyle, BorderStyleKind, BorderWidth, EdgeValue, EnumEntry, EqualsValue,
    PageMargin, PointSpec, TextCombineUpright, TrackSpec,
};

#[test]
fn edge_value_takes_a_length_or_auto() {
    pin::<EdgeValue>(&["10", "\"5%\"", "\"2em\"", "auto"], &["{ a: 1 }", "[1]"]);
}

#[test]
fn equals_value_takes_scalars_only() {
    pin::<EqualsValue>(&["\"shipped\"", "5", "true"], &["[1]", "{ a: 1 }"]);
    let schema = schema_of::<EqualsValue>();
    assert_eq!(
        schema["type"],
        serde_json::json!(["string", "number", "boolean"])
    );
}

#[test]
fn text_combine_upright_takes_two_keywords_or_a_bounded_digits_map() {
    pin::<TextCombineUpright>(
        &["none", "all", "{ digits: 2 }", "{ digits: 4 }"],
        // Both ends of the range the schema states, plus a third keyword.
        &["{ digits: 1 }", "{ digits: 5 }", "upright"],
    );
}

#[test]
fn border_width_takes_a_non_negative_number_or_a_side_map() {
    pin::<BorderWidth>(
        &["2", "0", "{ top: 1, left: 2 }"],
        // The schema says `minimum: 0` and the side keys are closed.
        &["-1", "{ top: -1 }", "{ topp: 1 }"],
    );
}

#[test]
fn border_color_takes_a_string_or_a_side_map() {
    pin::<BorderColor>(
        &["\"#ff0000\"", "{ top: \"#000000\" }"],
        &["{ nope: \"#000000\" }", "5"],
    );
}

#[test]
fn border_style_takes_a_closed_keyword_set_or_a_side_map() {
    pin::<BorderStyle>(
        &["solid", "double", "dashed", "dotted", "{ top: dashed }"],
        &["groovy", "{ top: groovy }"],
    );
    // The keyword arm must reach the same closed set the per-side arm does.
    let schema = schema_of::<BorderStyle>();
    let arms = schema["oneOf"].as_array().expect("BorderStyle is a oneOf");
    assert_eq!(arms.len(), 2, "a keyword arm and a per-side map arm");
    let side = &arms[1]["properties"]["top"];
    assert_eq!(&arms[0], side, "both arms take the same keyword schema");
    assert_eq!(
        schema_of::<BorderStyleKind>()["enum"]
            .as_array()
            .expect("BorderStyleKind is a closed enum")
            .len(),
        4,
    );
}

#[test]
fn page_margin_takes_a_number_a_side_map_or_a_positional_array() {
    pin::<PageMargin>(
        &["10", "{ top: 5 }", "[1, 2, 3, 4]"],
        // Negative and `auto` are rejected at parse; strings outright.
        &["-1", "{ top: auto }", "\"10mm\""],
    );
}

#[test]
fn track_spec_takes_a_whole_count_or_a_size_sequence() {
    pin::<TrackSpec>(
        &["3", "0", "[\"1fr\", \"30%\", 100]"],
        // The visitor refuses fractional counts and strings by name — which
        // is why the schema says `integer`, not `number`.
        &["1.5", "\"1fr\"", "-1"],
    );
}

#[test]
fn enum_entry_takes_the_labeled_object_or_a_bare_scalar() {
    pin::<EnumEntry>(
        &[
            "{ value: shipped, label: 出荷済み }",
            "shipped",
            "5",
            "true",
        ],
        // An object goes to the labeled form, which is deny_unknown_fields.
        &["{ value: shipped, labell: x }", "{ a: 1 }"],
    );
}

#[test]
fn a_point_takes_coordinates_or_an_anchor_but_never_a_mix() {
    pin::<PointSpec>(
        &[
            "{ x: 0, y: 0 }",
            "{ x: \"50%\", y: \"2em\" }",
            "{ item: total }",
            "{ item: total, edge: left, offset: { x: 4, y: -2 } }",
        ],
        // The two arms are exclusive, both are complete-or-nothing, and an
        // unknown key is refused BY NAME — the guarantee the untagged enum
        // would have cost.
        &[
            "{ x: 0, item: total }",
            "{ x: 0 }",
            "{}",
            "{ item: total, edge: centre }",
            "{ x: 0, y: 0, z: 1 }",
        ],
    );
    // The schema states the two arms rather than forwarding the permissive
    // helper the parser reads through.
    let schema = schema_of::<PointSpec>();
    let arms = schema["oneOf"].as_array().expect("two arms");
    assert_eq!(arms.len(), 2);
    assert_eq!(arms[1]["required"][0], "item");
}
