//! Unit tests for typed argument values.

use super::*;

#[test]
fn strings_are_sanitized_and_clipped() {
    // Control characters are stripped (log/terminal-injection guard).
    let v = ArgValue::from("a\nb\tc\u{1b}d");
    assert_eq!(v, ArgValue::Str("abcd".to_string()));

    // Over-long strings clip to the char cap.
    let long = "x".repeat(MAX_ARG_CHARS + 50);
    let ArgValue::Str(s) = ArgValue::from(long.as_str()) else {
        panic!("expected string");
    };
    assert_eq!(s.chars().count(), MAX_ARG_CHARS);
}

#[test]
fn non_finite_numbers_clamp_to_zero() {
    assert_eq!(ArgValue::number(f64::NAN), ArgValue::Num(0.0));
    assert_eq!(ArgValue::number(f64::INFINITY), ArgValue::Num(0.0));
    assert_eq!(ArgValue::number(3.5), ArgValue::Num(3.5));
}

#[test]
fn from_impls_cover_every_scalar_kind() {
    assert_eq!(ArgValue::from(true), ArgValue::Bool(true));
    assert_eq!(ArgValue::from(2.5_f64), ArgValue::Num(2.5));
    assert_eq!(ArgValue::from(7_usize), ArgValue::Num(7.0));
    assert_eq!(ArgValue::from(9_u64), ArgValue::Num(9.0));
    assert_eq!(ArgValue::from(-3_i64), ArgValue::Num(-3.0));
    assert_eq!(ArgValue::from(4_u32), ArgValue::Num(4.0));
    assert_eq!(ArgValue::from(String::from("s")), ArgValue::Str("s".into()));
    let owned = String::from("t");
    assert_eq!(ArgValue::from(&owned), ArgValue::Str("t".into()));
}

#[test]
fn render_prints_readable_scalars() {
    assert_eq!(ArgValue::Bool(false).render(), "false");
    assert_eq!(ArgValue::Num(10.0).render(), "10");
    assert_eq!(ArgValue::Num(3.3).render(), "3.3");
    assert_eq!(ArgValue::Num(-5.0).render(), "-5");
    assert_eq!(ArgValue::Num(3.2567).render(), "3.2567");
    assert_eq!(ArgValue::Num(1.25008).render(), "1.2501");
    assert_eq!(ArgValue::text("hi").render(), "hi");
}

#[test]
fn serializes_as_bare_scalar() {
    assert_eq!(serde_json::to_string(&ArgValue::Num(3.0)).unwrap(), "3.0");
    assert_eq!(
        serde_json::to_string(&ArgValue::Str("x".into())).unwrap(),
        "\"x\""
    );
    assert_eq!(
        serde_json::to_string(&ArgValue::Bool(true)).unwrap(),
        "true"
    );

    // Untagged deserialize resolves each JSON scalar to its variant.
    assert_eq!(
        serde_json::from_str::<ArgValue>("true").unwrap(),
        ArgValue::Bool(true)
    );
    assert_eq!(
        serde_json::from_str::<ArgValue>("4.5").unwrap(),
        ArgValue::Num(4.5)
    );
    assert_eq!(
        serde_json::from_str::<ArgValue>("\"z\"").unwrap(),
        ArgValue::Str("z".into())
    );
}
