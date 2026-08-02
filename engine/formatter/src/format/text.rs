//! The text arm: values that draw as words — plain strings, booleans and
//! image references — plus the `enum` display-label lookup layered over
//! them.
//!
//! A label is presentation only: params keep carrying the machine value
//! (`backorder`) and the document prints the declared words (`（入荷待ち）`),
//! which is what keeps display wording out of the data contract.

use super::{Formatted, Pick};
use serde_json::Value;
use shojiku_core::FieldSpec;

/// The placement pick that renders a labeled value as its raw value —
/// the escape out of the label, spelled like the type overrides it sits
/// beside (`{status:value}`).
const RAW_VARIANT: &str = "value";

/// Renders a text-shaped value.
///
/// Without declared labels this is the bare display string and an
/// authored pick stays inert: the text arm has no variants of its own,
/// and that silence predates labels. With labels the pick chooses
/// between the declared words (the default) and the raw value, and any
/// OTHER pick degrades to the label with the usual unknown-variant
/// warning.
pub(super) fn format_text(
    value: &Value,
    spec: Option<&FieldSpec>,
    pick: Option<Pick>,
) -> Formatted {
    let labels: &[(Value, String)] = match spec {
        Some(spec) => &spec.enum_labels,
        None => &[],
    };
    if labels.is_empty() || matches!(pick, Some(Pick::Name(RAW_VARIANT))) {
        return Formatted::clean(display_string(value));
    }
    let text = match label_for(labels, value) {
        Some(label) => label.to_string(),
        // An unlabeled member renders its value: partial labeling is
        // legitimate, so a miss is silent.
        None => display_string(value),
    };
    Formatted {
        text,
        warning: super::no_variant_warning(pick),
    }
}

/// The label declared for this value. Matched by VALUE equality, exactly
/// as enum membership is, so a value that satisfies the declared set
/// resolves the label the same set declares for it.
///
/// A loop, not `find().map()`: a per-binary uncovered closure
/// instantiation is what the coverage gate reports otherwise. First match
/// wins — a list declaring one value twice is malformed input, and
/// picking deterministically beats diagnosing it from the render path.
fn label_for<'a>(labels: &'a [(Value, String)], value: &Value) -> Option<&'a str> {
    for (declared, label) in labels {
        if declared == value {
            return Some(label);
        }
    }
    None
}

/// A value's verbatim display form: a string draws as itself, anything
/// else as its JSON spelling.
pub(super) fn display_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests;
