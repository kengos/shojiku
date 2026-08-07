//! Two-pass typed parse shared by the template and definitions entry points.
//!
//! Pass 1 parses to a `serde_yaml::Value` and rejects non-finite numbers
//! (the single choke point untrusted documents pass through — see
//! [`crate::yaml_guard`]). Pass 2 deserializes the typed model straight
//! from the source string through `serde_path_to_error`, so a structural
//! error (unknown key, wrong type, bad enum variant) carries the field
//! PATH and the YAML line/column. `serde_yaml::from_value` drops both,
//! which is why a mistyped top-level key used to surface only as a flood
//! of downstream binding errors instead of one located parse error.
//!
//! Limitation — internally-tagged enums: `serde` buffers the content of a
//! `#[serde(tag = "type")]` enum (the template's `Body` and `Item`) into an
//! intermediate value and re-deserializes it, so an error INSIDE a body item
//! truncates the path to the enum boundary (`sections.body`) and its
//! line/column point at the buffered container's start, not the offending
//! key. The serde MESSAGE still names the bad key and lists the expected
//! fields (so `key:` on a table column reports `unknown field \`key\`,
//! expected … \`data\``), and plain-struct inputs (definitions, top-level
//! template keys) keep full path + accurate location.

use crate::error::CoreError;
use serde::de::DeserializeOwned;

/// Parses `input` into `T`, rejecting non-finite numbers first and
/// returning a located [`CoreError`] on any structural failure.
pub(crate) fn parse_checked<T: DeserializeOwned>(
    input: &str,
    what: &'static str,
) -> Result<T, CoreError> {
    let raw: serde_yaml::Value = serde_yaml::from_str(input)?;
    crate::yaml_guard::ensure_finite(&raw, what)?;
    let de = serde_yaml::Deserializer::from_str(input);
    serde_path_to_error::deserialize(de).map_err(|err| CoreError::located(what, err))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Debug, Deserialize)]
    #[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
    #[serde(deny_unknown_fields)]
    struct Doc {
        items: Vec<Item>,
    }

    #[derive(Debug, Deserialize)]
    #[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
    #[serde(deny_unknown_fields)]
    struct Item {
        #[allow(dead_code)]
        name: String,
    }

    #[test]
    fn parses_valid_input() {
        let doc: Doc = parse_checked("items:\n  - name: a\n", "doc").expect("parse");
        assert_eq!(doc.items.len(), 1);
    }

    #[test]
    fn unknown_key_error_carries_path_and_location() {
        let err = parse_checked::<Doc>("items:\n  - name: a\n    bogus: x\n", "doc")
            .expect_err("must reject");
        // Plain structs (no tagged enum) keep the full path — the unknown
        // key is appended — and an accurate location.
        let CoreError::Located { path, line, .. } = &err else { panic!("{err:?}") };
        assert_eq!(path, "items[0].bogus");
        assert_eq!(*line, 3);
    }

    #[test]
    fn non_finite_is_rejected_before_typed_parse() {
        // Guard order: the finiteness check runs on pass 1, so `.inf`
        // is a `NonFinite`, never a located type error.
        let err = parse_checked::<Doc>("items:\n  - name: .inf\n", "doc").expect_err("reject");
        assert!(matches!(err, CoreError::NonFinite("doc")), "got: {err:?}");
    }

    #[test]
    fn malformed_yaml_surfaces_as_parse_error() {
        let err = parse_checked::<Doc>("items: [unterminated\n", "doc").expect_err("reject");
        assert!(matches!(err, CoreError::Parse(_)), "got: {err:?}");
    }
}
