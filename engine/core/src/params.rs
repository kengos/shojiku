//! `params` — runtime data supplied by the calling application.

use crate::error::CoreError;
use serde_json::Value;

/// Parses params from JSON or YAML into a JSON value tree, through the YAML
/// door ([`crate::yaml`]; YAML is a superset of JSON). Non-finite numbers
/// are refused there: `serde_json` would silently turn them into `null`,
/// hiding data problems from validation.
pub fn parse_params(input: &str) -> Result<Value, CoreError> {
    let doc = crate::parse::read(input, "params")?;
    Ok(serde_json::to_value(doc.into_tree())?)
}

/// Resolves a dotted binding path like `order.code` against a params tree.
///
/// Only object traversal is supported; array elements are addressed by the
/// table machinery, not by paths.
pub fn resolve_path<'a>(params: &'a Value, key: &str) -> Option<&'a Value> {
    let mut current = params;
    for part in key.split('.') {
        current = current.as_object()?.get(part)?;
    }
    Some(current)
}

/// Whether a resolved binding value counts as "intentionally blank" — the
/// trigger for a `placeholder`. The three blank spellings a form author
/// reaches for: the key is absent, it is `null`, or it is `""`.
///
/// Deliberately narrow: whitespace (`" "`, `"　"`) is real authored content
/// a form may want drawn, `0` and `false` are real values, and an empty
/// array/object belongs to the table/repeat machinery, not here. Anything
/// present but unusable (a `"abc"` date) stays a `format_error` — a data
/// bug must not hide behind a blank-form placeholder.
pub fn is_blank(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => true,
        Some(Value::String(s)) => s.is_empty(),
        Some(_) => false,
    }
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod size_tests;
