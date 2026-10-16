//! Tests for the hand-written `JsonSchema` impls.
//!
//! The drift gate compares the committed artifact against a fresh
//! generation, which is an IDEMPOTENCE claim: it protects a wrong schema
//! exactly as faithfully as a right one. These are the value assertions
//! underneath it — every form a hand-written schema declares is fed through
//! the REAL `Deserialize`, and at least one form it does not declare is
//! shown to be refused.

use schemars::generate::SchemaSettings;
use schemars::{JsonSchema, SchemaGenerator};
use serde::Deserialize;
use serde_json::Value;

mod forward;
mod handwritten;

/// A fresh generator with the catalog's own settings.
fn generator() -> SchemaGenerator {
    SchemaSettings::draft2020_12()
        .for_deserialize()
        .into_generator()
}

/// One type's schema, as JSON.
fn schema_of<T: JsonSchema>() -> Value {
    T::json_schema(&mut generator()).to_value()
}

/// Whether the real parser accepts this YAML as a `T`.
fn parses<T>(yaml: &str) -> bool
where
    T: for<'de> Deserialize<'de>,
{
    serde_yaml::from_str::<T>(yaml).is_ok()
}

/// Asserts every form in `accepted` parses and every form in `refused` does
/// not — the two clauses a hand-written schema owes. Reports which form
/// failed, so a red run names the case rather than the type.
fn pin<T>(accepted: &[&str], refused: &[&str])
where
    T: for<'de> Deserialize<'de>,
{
    assert!(
        !accepted.is_empty(),
        "a schema with no accepted form is not pinned"
    );
    assert!(
        !refused.is_empty(),
        "a schema with no refused form is not pinned"
    );
    for form in accepted {
        assert!(
            parses::<T>(form),
            "the schema declares `{form}` but the parser refuses it"
        );
    }
    for form in refused {
        assert!(
            !parses::<T>(form),
            "the parser accepts `{form}`, which the schema does not declare"
        );
    }
}

/// Whether a `oneOf` schema admits the STRING `text` — exactly one arm must
/// match, as `oneOf` requires: a `const` equal to it, or a string arm whose
/// `pattern` matches (or that has no pattern at all). This is the catalog's
/// own answer, evaluated the way a reader of the artifact evaluates it, so it
/// can disagree with the parser — which is the point.
fn schema_admits_string(schema: &Value, text: &str) -> bool {
    let arms = schema["oneOf"].as_array().expect("a oneOf schema");
    let matching = arms.iter().filter(|arm| {
        if let Some(constant) = arm.get("const") {
            return constant == text;
        }
        if arm["type"] != "string" {
            return false;
        }
        arm["pattern"].as_str().is_none_or(|pattern| {
            regex_lite::Regex::new(pattern)
                .expect("a catalog pattern compiles")
                .is_match(text)
        })
    });
    matching.count() == 1
}

/// Asserts the schema and the parser give the SAME answer for every string
/// in `cases`. [`pin`] only feeds the forms the schema names through the
/// parser, so it cannot see a pattern that admits too much; this asks the
/// pattern itself.
fn strings_agree<T>(cases: &[&str])
where
    T: JsonSchema + for<'de> Deserialize<'de>,
{
    let schema = schema_of::<T>();
    for text in cases {
        let quoted = serde_json::to_string(text).expect("a string serializes");
        assert_eq!(
            schema_admits_string(&schema, text),
            parses::<T>(&quoted),
            "the schema and the parser disagree on {quoted}"
        );
    }
}

/// Asserts each string is accepted by the parser and NOT admitted by the
/// schema: the cases where the catalog is deliberately narrower, listed so a
/// widening of either side shows up here rather than nowhere.
fn schema_narrower<T>(cases: &[&str])
where
    T: JsonSchema + for<'de> Deserialize<'de>,
{
    let schema = schema_of::<T>();
    for text in cases {
        let quoted = serde_json::to_string(text).expect("a string serializes");
        assert!(parses::<T>(&quoted), "the parser refuses {quoted}");
        assert!(
            !schema_admits_string(&schema, text),
            "the schema admits {quoted}"
        );
    }
}
