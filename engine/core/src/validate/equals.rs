//! What a declarative `{ key, equals? }` binding can be checked against
//! at validate time — shared by form marks and table row conditions, so
//! the two surfaces cannot drift apart.
//!
//! Layout already evaluates these predicates against real params
//! (`engine/layout`'s `eval_predicate`). This is the half that needs only
//! the DECLARATION: an `equals` literal of the wrong kind, or one outside
//! a declared `enum`, is a predicate that can never hold for any params —
//! a template mistake, reported before anyone renders. The literal itself
//! is never echoed; only the key names the field.

use crate::catalog::{ArrayElement, Catalog, FieldSpec};
use crate::definitions::FieldType;
use crate::template::EqualsValue;
use serde_json::Value;

/// What a binding key resolves to. An ARRAY source is the multi-select
/// form — the predicate reads its ELEMENTS, so an `equals` is checked
/// against the element spec when the schema declares a scalar one.
pub(super) enum EqualsTarget<'a> {
    Scalar(&'a FieldSpec),
    Array(Option<&'a FieldSpec>),
}

/// Why an `equals` literal can never match.
pub(super) enum EqualsFault {
    /// A different scalar kind than the field declares (`equals: 2` on a
    /// `string`): type-strict equality can never hold.
    Kind,
    /// Outside the field's declared `enum`: the value set is closed, so
    /// no params value can carry it.
    NotDeclared,
}

/// Resolves a binding key against the catalog — `None` when the key is
/// declared nowhere (the caller owns that diagnostic, whose wording names
/// its own surface).
pub(super) fn resolve_target<'a>(
    catalog: &'a Catalog,
    group: Option<&str>,
    key: &str,
) -> Option<EqualsTarget<'a>> {
    let field = match group {
        Some(group) => catalog.array_field(group, key),
        None => catalog.scalar(key),
    };
    if let Some(spec) = field {
        return Some(EqualsTarget::Scalar(spec));
    }
    // Not a leaf: the key may still name an array SOURCE — a row-relative
    // one inside a group, or a top-level one at document scope.
    let source = match group {
        Some(group) => catalog
            .row_array(group, key)
            .then(|| format!("{group}.{key}")),
        None => catalog.is_array(key).then(|| key.to_string()),
    }?;
    Some(EqualsTarget::Array(match catalog.array_element(&source) {
        Some(ArrayElement::Scalar(spec)) => Some(spec),
        _ => None,
    }))
}

/// Whether an `equals`-less binding can hold: it reads the value as a
/// boolean, so only a boolean-declared LEAF can. An array source never
/// can — the value is a list, whatever its elements are.
pub(super) fn reads_as_boolean(target: &EqualsTarget<'_>) -> bool {
    match target {
        EqualsTarget::Scalar(spec) => spec.field_type == FieldType::Boolean,
        EqualsTarget::Array(_) => false,
    }
}

/// Checks an `equals` literal against what the field declares.
pub(super) fn equals_fault(target: &EqualsTarget<'_>, equals: &EqualsValue) -> Option<EqualsFault> {
    let spec = match target {
        EqualsTarget::Scalar(spec) => spec,
        // An element the schema does not describe: nothing to check
        // against, so nothing is claimed.
        EqualsTarget::Array(element) => (*element)?,
    };
    if !same_kind(&equals.0, spec.field_type) {
        return Some(EqualsFault::Kind);
    }
    let declared = &spec.enum_values;
    if !declared.is_empty() && !declared.iter().any(|value| value == &equals.0) {
        return Some(EqualsFault::NotDeclared);
    }
    None
}

/// Whether the literal's JSON kind is the one the declared field type
/// carries. A field type the wire cannot express as a scalar literal
/// (`image`) never matches, which is itself the mismatch.
fn same_kind(value: &Value, field_type: FieldType) -> bool {
    match field_type {
        FieldType::Boolean => value.is_boolean(),
        FieldType::Number | FieldType::Currency | FieldType::Quantity | FieldType::Percentage => {
            value.is_number()
        }
        FieldType::String | FieldType::Date | FieldType::Datetime | FieldType::Image => {
            value.is_string()
        }
    }
}

#[cfg(test)]
mod tests;
