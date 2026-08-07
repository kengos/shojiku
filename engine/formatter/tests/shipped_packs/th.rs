//! Goldens for the shipped th-TH pack — the Buddhist era in particular,
//! which is what makes this pack's date output differ from every other
//! shipped one, and the `compact` variant's known gap.

use super::*;

#[test]
fn th_th_renders_thai_chrome_in_the_buddhist_era() {
    let pack = shipped("th-TH");
    assert_eq!(pack.currency_default.as_deref(), Some("THB"));

    let thb = currency_spec("THB");
    assert_eq!(
        fmt(&json!(1234.5), Some(&thb), Some("symbol"), &pack),
        "฿1,234.50"
    );
    assert_eq!(
        fmt(&json!(1234.5), Some(&thb), Some("name"), &pack),
        "1,234.50 บาทไทย"
    );

    // 2026 CE is 2569 BE: the era table carries CLDR's `-542-01-01` start
    // and `y` renders the era year, so the Buddhist year comes out of the
    // SHIPPED file rather than any arithmetic in the test.
    let date = spec(FieldType::Date);
    assert_eq!(fmt(&json!(DAY), Some(&date), None, &pack), "14 มี.ค. 2569");
    assert_eq!(
        fmt(&json!(DAY), Some(&date), Some("long"), &pack),
        "วันเสาร์ที่ 14 มีนาคม พ.ศ. 2569"
    );
    // `yyyy` is always the Gregorian year — the escape hatch for a document
    // that must print CE.
    assert_eq!(
        fmt(&json!(DAY), Some(&date), Some("gregorian"), &pack),
        "14 มี.ค. 2026"
    );

    assert_eq!(
        fmt(&json!(3), Some(&quantity_spec()), None, &pack),
        "3 รายการ"
    );
}

#[test]
fn th_th_datetime_carries_the_era_too() {
    let pack = shipped("th-TH");
    let stamp = spec(FieldType::Datetime);
    assert_eq!(
        fmt(&json!("2026-03-14T09:05:00Z"), Some(&stamp), None, &pack),
        "14 มี.ค. 2569 09:05"
    );
    assert_eq!(
        fmt(
            &json!("2026-03-14T09:05:00Z"),
            Some(&stamp),
            Some("gregorian"),
            &pack
        ),
        "14 มี.ค. 2026 09:05"
    );
}

#[test]
fn no_shipped_pack_spells_a_two_digit_year() {
    // KNOWN GAP, and the reason every `compact` pattern deviates from
    // CLDR. CLDR spells short dates with `yy`, a TWO-DIGIT year, and the
    // engine's token inventory has no such token — the longest match for
    // `yy` is `y` twice, so a pattern carrying it renders the year
    // DOUBLED (`14/3/20262026`). Every shipped pack therefore spells the
    // year in full instead.
    //
    // When a `yy` token ships, this test fails and the fix is: change
    // these expectations to the two-digit form, and restore CLDR's `yy`
    // in the `compact` patterns in `scripts/gen-locale-builtins.py`.
    let date = spec(FieldType::Date);
    for (id, compact) in [
        ("th-TH", "14/3/2569"),
        ("hi-IN", "14/3/2026"),
        ("fil-PH", "3/14/2026"),
        ("zh-TW", "2026/3/14"),
        ("zh-CN", "2026/3/14"),
    ] {
        let pack = shipped(id);
        assert_eq!(
            fmt(&json!(DAY), Some(&date), Some("compact"), &pack),
            compact,
            "{id} compact",
        );
        // EVERY pattern, not just `compact` — the token is unsupported
        // wherever it appears. Token-aware, because `yyyy` is legitimate
        // and contains `yy` as a substring.
        for (variant, pattern) in &pack.date_formats {
            assert!(
                !has_two_digit_year(pattern),
                "{id} `{variant}` authors the unsupported two-digit year: {pattern}",
            );
        }
    }
}

/// Whether `pattern` carries a bare `yy` — a run of exactly two year
/// letters. `y` and `yyyy` are both real tokens; `yy` is not, and a
/// substring test cannot tell it from the tail of `yyyy`.
fn has_two_digit_year(pattern: &str) -> bool {
    let mut run = 0usize;
    let mut runs = Vec::new();
    for c in pattern.chars() {
        if c == 'y' {
            run += 1;
        } else if run > 0 {
            runs.push(run);
            run = 0;
        }
    }
    if run > 0 {
        runs.push(run);
    }
    runs.contains(&2)
}
