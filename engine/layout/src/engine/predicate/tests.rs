//! Truth table for the shared `{ key, equals? }` predicate.

use super::*;
use serde_json::json;

fn eq(v: serde_json::Value) -> EqualsValue {
    EqualsValue(v)
}

#[test]
fn scalar_exact_match_draws() {
    let v = json!("カード");
    assert_eq!(
        eval_predicate(Some(&v), Some(&eq(json!("カード")))),
        PredicateEval::Apply
    );
}

#[test]
fn scalar_same_type_different_value_skips_silently() {
    let v = json!("現金");
    assert_eq!(
        eval_predicate(Some(&v), Some(&eq(json!("カード")))),
        PredicateEval::Skip
    );
}

#[test]
fn scalar_type_mismatch_warns() {
    // params has the string "2", equals is the number 2.
    let v = json!("2");
    assert_eq!(
        eval_predicate(Some(&v), Some(&eq(json!(2)))),
        PredicateEval::TypeMismatch
    );
    // and the reverse: number value vs string equals.
    let v = json!(2);
    assert_eq!(
        eval_predicate(Some(&v), Some(&eq(json!("2")))),
        PredicateEval::TypeMismatch
    );
}

#[test]
fn number_and_bool_equals_match() {
    let v = json!(0);
    assert_eq!(
        eval_predicate(Some(&v), Some(&eq(json!(0)))),
        PredicateEval::Apply
    );
    let v = json!(true);
    assert_eq!(
        eval_predicate(Some(&v), Some(&eq(json!(true)))),
        PredicateEval::Apply
    );
    let v = json!(true);
    assert_eq!(
        eval_predicate(Some(&v), Some(&eq(json!(false)))),
        PredicateEval::Skip
    );
}

#[test]
fn array_contains_draws() {
    let v = json!(["1", "3"]);
    assert_eq!(
        eval_predicate(Some(&v), Some(&eq(json!("1")))),
        PredicateEval::Apply
    );
    assert_eq!(
        eval_predicate(Some(&v), Some(&eq(json!("3")))),
        PredicateEval::Apply
    );
}

#[test]
fn array_missing_element_skips_silently() {
    let v = json!(["1", "3"]);
    assert_eq!(
        eval_predicate(Some(&v), Some(&eq(json!("2")))),
        PredicateEval::Skip
    );
}

#[test]
fn array_all_wrong_type_warns() {
    // all string codes, equals is a number: no element even shares the kind.
    let v = json!(["1", "3"]);
    assert_eq!(
        eval_predicate(Some(&v), Some(&eq(json!(2)))),
        PredicateEval::TypeMismatch
    );
}

#[test]
fn array_non_scalar_elements_are_ignored() {
    // mixed: a matching scalar draws; a nested array/object never matches.
    let v = json!([{"a": 1}, "3"]);
    assert_eq!(
        eval_predicate(Some(&v), Some(&eq(json!("3")))),
        PredicateEval::Apply
    );
    // Non-empty but only non-scalar elements → the codes are malformed.
    let v = json!([{"a": 1}]);
    assert_eq!(
        eval_predicate(Some(&v), Some(&eq(json!("x")))),
        PredicateEval::TypeMismatch
    );
}

#[test]
fn empty_array_is_a_silent_empty_multi_select() {
    // A blank form's empty multi-select must not warn on every box.
    let empty = json!([]);
    assert_eq!(
        eval_predicate(Some(&empty), Some(&eq(json!("x")))),
        PredicateEval::Skip
    );
}

#[test]
fn missing_value_skips_silently() {
    assert_eq!(
        eval_predicate(None, Some(&eq(json!("カード")))),
        PredicateEval::Skip
    );
    assert_eq!(eval_predicate(None, None), PredicateEval::Skip);
}

#[test]
fn boolean_binding_without_equals() {
    let t = json!(true);
    assert_eq!(eval_predicate(Some(&t), None), PredicateEval::Apply);
    let f = json!(false);
    assert_eq!(eval_predicate(Some(&f), None), PredicateEval::Skip);
    let s = json!("yes");
    assert_eq!(eval_predicate(Some(&s), None), PredicateEval::NotBool);
    let arr = json!([true]);
    assert_eq!(eval_predicate(Some(&arr), None), PredicateEval::NotBool);
}
