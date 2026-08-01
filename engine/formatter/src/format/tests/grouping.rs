//! Digit-group sizes: the CLDR `#,##,##0` (Indian 2,2,3) rule, the
//! uniform default every other locale uses, and the hostile pack edges
//! (zero and absurd sizes) that must not panic or hang.

use super::*;

/// A pack with the given grouping sizes; `secondary` omitted when `None`.
fn grouped_pack(primary: u32, secondary: Option<u32>) -> LangPack {
    let sec = match secondary {
        Some(n) => format!("  secondaryGroupSize: {n}\n"),
        None => String::new(),
    };
    LangPack::from_yaml_str(&format!(
        "id: xx-XX\nnumber:\n  groupSeparator: \",\"\n  decimalSeparator: \".\"\n  groupSize: {primary}\n{sec}"
    ))
    .expect("pack")
}

#[test]
fn indian_grouping_opens_at_three_then_repeats_every_two() {
    // CLDR hi `#,##,##0`: the first group is 3 digits, every group left of
    // it is 2 — so lakh/crore land where an Indian reader expects them.
    let pack = grouped_pack(3, Some(2));
    assert_eq!(fmt(&json!(999), None, None, &pack), "999");
    assert_eq!(fmt(&json!(1000), None, None, &pack), "1,000");
    assert_eq!(fmt(&json!(100_000), None, None, &pack), "1,00,000");
    assert_eq!(fmt(&json!(1_234_567), None, None, &pack), "12,34,567");
    assert_eq!(fmt(&json!(12_345_678), None, None, &pack), "1,23,45,678");
}

#[test]
fn indian_grouping_keeps_the_sign_and_the_decimals() {
    let pack = grouped_pack(3, Some(2));
    assert_eq!(fmt(&json!(-1_234_567), None, None, &pack), "-12,34,567");
    assert_eq!(fmt(&json!(1_234_567.89), None, None, &pack), "12,34,567.89");
}

#[test]
fn an_absent_secondary_size_groups_uniformly() {
    // No `secondaryGroupSize` = repeat the primary size (today's behavior
    // for every pack that predates the key).
    assert_eq!(
        fmt(&json!(1_234_567), None, None, &grouped_pack(3, None)),
        "1,234,567"
    );
    // A non-3 uniform size still works (Chinese-style 4-digit grouping).
    assert_eq!(
        fmt(&json!(12_345_678), None, None, &grouped_pack(4, None)),
        "1234,5678"
    );
}

#[test]
fn a_zero_group_size_disables_grouping_instead_of_dividing_by_zero() {
    // Sizes come from an untrusted pack: `% 0` would panic and "a group
    // every zero digits" has no meaning, so both zeros mean "no grouping"
    // (secondary 0 falls back to the primary size).
    assert_eq!(
        fmt(&json!(-1_234_567), None, None, &grouped_pack(0, None)),
        "-1234567"
    );
    assert_eq!(
        fmt(&json!(1_234_567), None, None, &grouped_pack(0, Some(2))),
        "1234567"
    );
    assert_eq!(
        fmt(&json!(1_234_567), None, None, &grouped_pack(3, Some(0))),
        "1,234,567"
    );
}

#[test]
fn absurd_group_sizes_render_ungrouped_without_panicking() {
    // u32::MAX never matches a real digit count — no panic, no separator,
    // and no attempt to allocate per-group.
    let pack = grouped_pack(u32::MAX, Some(u32::MAX));
    assert_eq!(fmt(&json!(1_234_567), None, None, &pack), "1234567");
}
