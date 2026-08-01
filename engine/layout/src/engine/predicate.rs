//! Pure presence predicate shared by the declarative `{ key, equals? }`
//! bindings: given a resolved params value and an optional `equals`,
//! decide whether the thing it gates applies. Form marks bind their
//! *drawing* this way and a table row binds its *conditional style* the
//! same way — one truth table, no second grammar. Type-strict (`"2"`
//! never equals `2`) with an array-contains path for multi-select. Kept
//! free of `Ctx` so the truth table is unit-testable in isolation.

use serde_json::Value;
use shojiku_core::EqualsValue;

/// The outcome of evaluating a binding's predicate.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum PredicateEval {
    /// The predicate holds (the mark draws / the row style applies).
    Apply,
    /// It does not hold (a normal, unremarkable non-match, or a missing
    /// value — silent so blank-form params draw nothing).
    Skip,
    /// `equals` and the value are different scalar types (`equals: 2` vs
    /// `"2"`, or an array whose elements never share the type): the
    /// author almost certainly wrote the wrong literal — warn.
    TypeMismatch,
    /// `equals` is absent (a boolean binding) but the value is not a
    /// boolean — warn.
    NotBool,
}

/// Evaluates a binding's value against its optional `equals`.
pub(super) fn eval_predicate(value: Option<&Value>, equals: Option<&EqualsValue>) -> PredicateEval {
    let Some(value) = value else {
        return PredicateEval::Skip;
    };
    match equals {
        Some(EqualsValue(target)) => match value {
            Value::Array(items) => eval_contains(items, target),
            scalar if same_kind(scalar, target) => {
                if scalar == target {
                    PredicateEval::Apply
                } else {
                    PredicateEval::Skip
                }
            }
            _ => PredicateEval::TypeMismatch,
        },
        None => match value {
            Value::Bool(true) => PredicateEval::Apply,
            Value::Bool(false) => PredicateEval::Skip,
            _ => PredicateEval::NotBool,
        },
    }
}

/// Multi-select: apply if any element equals the target; otherwise a
/// silent skip. An **empty** array is a legitimately-empty multi-select
/// (a blank form) and stays silent; only a *non-empty* array whose scalar
/// elements never share the target's type warns (the codes are the wrong
/// literal kind).
fn eval_contains(items: &[Value], target: &Value) -> PredicateEval {
    if items.iter().any(|item| item == target) {
        PredicateEval::Apply
    } else if items.is_empty() || items.iter().any(|item| same_kind(item, target)) {
        PredicateEval::Skip
    } else {
        PredicateEval::TypeMismatch
    }
}

/// Whether two JSON values are the same scalar kind (string/number/bool).
/// Non-scalars never share a kind (so they never match a scalar target).
fn same_kind(a: &Value, b: &Value) -> bool {
    matches!(
        (a, b),
        (Value::String(_), Value::String(_))
            | (Value::Number(_), Value::Number(_))
            | (Value::Bool(_), Value::Bool(_))
    )
}

#[cfg(test)]
mod tests;
