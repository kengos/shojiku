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
