//! The four types whose `Deserialize` runs a `*Repr` and THEN validates.
//!
//! The plan called these "forwarded" and expected the schema to equal the
//! Repr's. The first gate run falsified it: `BasisRepr` is `number | string`
//! while `flexBasis` accepts `0` and `"content"` and nothing else, so an
//! equality assertion would have PINNED a too-wide schema. A too-wide
//! catalog is the failure mode this artifact exists to prevent — it teaches
//! an agent to emit input the engine rejects — so each is pinned the same
//! two-clause way as the rest: every declared form parses, and a form the
//! schema excludes does not.

use super::{pin, schema_of};
use crate::edges::EdgeMapRepr;
use crate::{EdgeSpec, FlexBasis, GridTrack, Length, PageSize};

#[test]
fn length_takes_a_number_or_a_unit_suffixed_string() {
    pin::<Length>(
        &[
            "10", "\"10mm\"", "\"5%\"", "\"2em\"", "\"1rem\"", "\"3pt\"", "\"1in\"", "\"2cm\"",
        ],
        // A bare numeric STRING has no unit and is refused — which is the
        // whole reason the schema carries a pattern rather than `"string"`.
        &["\"10\"", "\"10px\"", "\"abc\""],
    );
}

/// The extreme case, and the one that falsified the forwarding premise:
/// two accepted values behind a Repr that admits every number and string.
#[test]
fn flex_basis_takes_content_or_zero_and_nothing_else() {
    pin::<FlexBasis>(&["content", "0"], &["1", "\"50%\"", "auto"]);
    assert_eq!(
        schema_of::<FlexBasis>()["enum"],
        serde_json::json!(["content", 0])
    );
}

#[test]
fn page_size_takes_one_of_eight_names_or_a_custom_pair() {
    pin::<PageSize>(
        &[
            "A3",
            "A4",
            "A5",
            "B4",
            "B5",
            "Letter",
            "Legal",
            "Tabloid",
            "{ w: 100, h: 200 }",
        ],
        // Not a name, and a custom side that is not ABSOLUTE.
        &["A6", "letter", "{ w: \"50%\", h: 200 }"],
    );
    let names = schema_of::<PageSize>()["oneOf"][0]["enum"]
        .as_array()
        .expect("the name arm is a closed enum")
        .len();
    assert_eq!(names, 8, "the catalog must list every accepted page name");
}

#[test]
fn grid_track_takes_a_number_auto_an_fr_weight_or_a_length() {
    pin::<GridTrack>(
        &["100", "auto", "\"1fr\"", "\"30%\"", "\"20mm\""],
        &["\"1x\"", "\"fill\""],
    );
}

/// `EdgeSpec` is the one arm that really is delegated: `visit_map` parses
/// through [`EdgeMapRepr`] with no extra validation, so the schema must
/// `$ref` it — a reference, not a copy, which is what makes that arm unable
/// to drift.
#[test]
fn edge_spec_map_arm_refs_its_deserialize_repr() {
    let schema = schema_of::<EdgeSpec>();
    let arms = schema["oneOf"].as_array().expect("EdgeSpec is a oneOf");
    assert_eq!(arms.len(), 2, "a number arm and a map arm");
    assert_eq!(arms[0]["type"], "number");
    let reference = arms[1]["$ref"].as_str().expect("the map arm is a $ref");
    assert!(
        reference.ends_with("/EdgeMapRepr"),
        "the map arm must reference EdgeMapRepr, got `{reference}`"
    );
    // The reference resolves: the Repr is a real, generatable shape.
    assert!(schema_of::<EdgeMapRepr>()["properties"]["top"].is_object());

    pin::<EdgeSpec>(
        &["4", "{ top: 4, left: auto }"],
        // The visitor refuses strings by name; the schema offers none.
        &["\"4mm\"", "[1, 2, 3, 4]"],
    );
}
