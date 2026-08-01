//! Unit tests for message-template substitution.

use super::*;

fn args(pairs: &[(&str, ArgValue)]) -> BTreeMap<String, ArgValue> {
    pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.clone()))
        .collect()
}

#[test]
fn fills_known_placeholders() {
    let a = args(&[("key", ArgValue::text("total")), ("n", ArgValue::Num(3.0))]);
    assert_eq!(
        render("`{key}` has {n} entries", &a),
        "`total` has 3 entries"
    );
}

#[test]
fn leaves_unknown_placeholder_literal() {
    let a = args(&[("key", ArgValue::text("x"))]);
    assert_eq!(render("{key} then {missing}", &a), "x then {missing}");
}

#[test]
fn substitution_is_single_pass() {
    // An arg value containing a brace is copied verbatim, never re-scanned.
    let a = args(&[("a", ArgValue::text("{b}")), ("b", ArgValue::text("BOOM"))]);
    assert_eq!(render("{a}", &a), "{b}");
}

#[test]
fn unterminated_brace_is_emitted_verbatim() {
    let a = args(&[("k", ArgValue::text("v"))]);
    assert_eq!(
        render("start {k} tail {unterminated", &a),
        "start v tail {unterminated"
    );
}

#[test]
fn no_placeholders_returns_template() {
    assert_eq!(render("plain text", &BTreeMap::new()), "plain text");
}

#[test]
fn literal_brace_group_without_arg_survives() {
    // Registry templates are ICU-safe (no literal brace groups — enforced
    // by `templates_are_icu_safe`), but the renderer itself must still
    // degrade gracefully if one ever slips through: the group stays
    // literal, nothing panics.
    assert_eq!(
        render("custom `{ w, h }` page size", &BTreeMap::new()),
        "custom `{ w, h }` page size"
    );
}
