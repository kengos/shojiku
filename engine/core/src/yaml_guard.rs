//! Input sanitation shared by the YAML/JSON parse entry points.
//!
//! YAML accepts `.nan` / `.inf` literals. Non-finite numbers poison every
//! geometry computation downstream, and `serde_json` silently converts
//! them to `null`, so they must be rejected at the parse boundary — this
//! is the single choke point untrusted documents pass through.

use crate::error::CoreError;

/// Returns an error if any number anywhere in the document is NaN/Infinity.
pub(crate) fn ensure_finite(
    value: &serde_yaml::Value,
    what: &'static str,
) -> Result<(), CoreError> {
    if has_non_finite(value) {
        return Err(CoreError::NonFinite(what));
    }
    Ok(())
}

fn has_non_finite(value: &serde_yaml::Value) -> bool {
    match value {
        serde_yaml::Value::Number(n) => n.as_f64().is_some_and(|f| !f.is_finite()),
        serde_yaml::Value::Sequence(items) => items.iter().any(has_non_finite),
        serde_yaml::Value::Mapping(map) => map
            .iter()
            .any(|(k, v)| has_non_finite(k) || has_non_finite(v)),
        serde_yaml::Value::Tagged(tagged) => has_non_finite(&tagged.value),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(s: &str) -> serde_yaml::Value {
        serde_yaml::from_str(s).expect("yaml")
    }

    #[test]
    fn finite_documents_pass() {
        assert!(ensure_finite(&parse("a: {b: [1, 2.5, -3]}"), "doc").is_ok());
        assert!(ensure_finite(&parse("plain string"), "doc").is_ok());
    }

    #[test]
    fn nan_and_inf_are_rejected_at_any_depth() {
        assert!(ensure_finite(&parse("a: .nan"), "doc").is_err());
        assert!(ensure_finite(&parse("a: [1, {b: .inf}]"), "doc").is_err());
        assert!(ensure_finite(&parse("a: -.inf"), "doc").is_err());
    }

    #[test]
    fn tagged_values_are_inspected() {
        assert!(ensure_finite(&parse("a: !custom .inf"), "doc").is_err());
        assert!(ensure_finite(&parse("a: !custom 1.5"), "doc").is_ok());
    }
}
