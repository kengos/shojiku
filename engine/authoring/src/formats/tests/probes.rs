//! Pattern probes, their caps, and the catalog's determinism.

use super::*;

// ── probes ───────────────────────────────────────────────────────────────

#[test]
fn a_probe_renders_the_pattern_through_the_real_dispatch() {
    let template = empty_template();
    let out = format_catalog(
        Some(&template),
        &ja(),
        &[PatternProbe {
            field_type: ProbeType::Date,
            pattern: "yyyy年M月d日".to_string(),
        }],
    );
    assert_eq!(out.probes[0].sample, "2026年11月3日");
    assert_eq!(out.probes[0].warning, None);
    assert_eq!(out.probes[0].refused, None);
}

#[test]
fn a_malformed_pattern_degrades_and_never_errors() {
    // The other half of the probe contract. The formatter's posture is
    // degrade-never-fail, so a pattern nobody could have meant still comes
    // back as a rendered STRING rather than as an error — which is what lets
    // a picker preview a half-typed pattern at every keystroke.
    let template = empty_template();
    for pattern in ["yyyy'", "'", "\u{202e}yyyy", "!!!"] {
        let out = format_catalog(
            Some(&template),
            &ja(),
            &[PatternProbe {
                field_type: ProbeType::Date,
                pattern: pattern.to_string(),
            }],
        );
        assert_eq!(
            out.probes[0].refused, None,
            "`{pattern}` was refused rather than degraded"
        );
    }
    // Which degradation, for the two shapes worth pinning. A lone quote opens
    // a literal run with nothing in it, so the whole sample is empty — the
    // documented behaviour, not a swallowed error.
    let empty = format_catalog(
        Some(&template),
        &ja(),
        &[PatternProbe {
            field_type: ProbeType::Date,
            pattern: "'".to_string(),
        }],
    );
    assert_eq!(empty.probes[0].sample, "");
    // And an unterminated quote after real tokens makes the REST literal, so
    // the year renders and the quoted tail comes through as written.
    let out = format_catalog(
        Some(&template),
        &ja(),
        &[PatternProbe {
            field_type: ProbeType::Date,
            pattern: "yyyy'年".to_string(),
        }],
    );
    assert_eq!(out.probes[0].sample, "2026年");
}

#[test]
fn a_probe_past_the_pattern_cap_is_refused_and_never_rendered() {
    let template = empty_template();
    let out = format_catalog(
        Some(&template),
        &ja(),
        &[PatternProbe {
            field_type: ProbeType::Date,
            pattern: "d".repeat(MAX_PROBE_PATTERN + 1),
        }],
    );
    assert_eq!(out.probes[0].refused, Some(ProbeRefusal::PatternTooLong));
    assert_eq!(out.probes[0].sample, "");
}

#[test]
fn a_pattern_exactly_at_the_cap_is_still_run() {
    // The boundary the cap creates: the largest input it admits must work,
    // or the guard is really one character tighter than it says.
    let template = empty_template();
    let out = format_catalog(
        Some(&template),
        &ja(),
        &[PatternProbe {
            field_type: ProbeType::Date,
            pattern: "d".repeat(MAX_PROBE_PATTERN),
        }],
    );
    assert_eq!(out.probes[0].refused, None);
    // The token table is longest-match, so a run of `d` pairs into `dd`
    // (zero-padded) rather than rendering the bare day 256 times.
    assert_eq!(out.probes[0].sample, "03".repeat(MAX_PROBE_PATTERN / 2));
}

#[test]
fn probes_past_the_count_cap_are_refused_individually() {
    let template = empty_template();
    let probes: Vec<PatternProbe> = (0..MAX_PROBES + 2)
        .map(|_| PatternProbe {
            field_type: ProbeType::Date,
            pattern: "d".to_string(),
        })
        .collect();
    let out = format_catalog(Some(&template), &ja(), &probes);
    assert_eq!(out.probes.len(), MAX_PROBES + 2);
    assert_eq!(out.probes[MAX_PROBES - 1].refused, None);
    assert_eq!(
        out.probes[MAX_PROBES].refused,
        Some(ProbeRefusal::TooManyProbes)
    );
}

#[test]
fn a_datetime_probe_uses_the_datetime_slot() {
    let template = empty_template();
    let out = format_catalog(
        Some(&template),
        &ja(),
        &[PatternProbe {
            field_type: ProbeType::Datetime,
            pattern: "HH:mm".to_string(),
        }],
    );
    assert_eq!(out.probes[0].sample, "14:05");
}

// ── determinism ──────────────────────────────────────────────────────────

#[test]
fn the_same_template_and_pack_produce_an_identical_catalog() {
    let template = template(
        "defaults: { locale: ja-JP, currency: JPY, formats: { date: wareki } }\n\
         formats:\n  stamp: { type: date, pattern: \"yyyy.MM.dd\" }\n",
    );
    assert_eq!(catalog(&template), catalog(&template));
}

#[test]
fn the_document_currency_reaches_the_currency_samples() {
    // The sample must be what the DOCUMENT renders, not a house default —
    // JPY rounds to whole yen, USD keeps two decimals.
    let jpy = template("defaults: { currency: JPY }\n");
    let usd = template("defaults: { currency: USD }\n");
    assert_ne!(
        sample_for(&catalog(&jpy), "currency", "symbol"),
        sample_for(&catalog(&usd), "currency", "symbol")
    );
}

// ── host input rules (one set for CLI, MCP and wasm) ─────────────────────

#[test]
fn only_date_and_datetime_have_a_pattern_form() {
    assert_eq!(ProbeType::from_name("date"), Some(ProbeType::Date));
    assert_eq!(ProbeType::from_name("datetime"), Some(ProbeType::Datetime));
    // Real field types with no pattern form, and a name that is no type.
    for name in [
        "currency",
        "number",
        "percentage",
        "quantity",
        "text",
        "nope",
        "",
    ] {
        assert_eq!(ProbeType::from_name(name), None, "{name}");
    }
}

#[test]
fn a_probe_is_built_from_a_raw_name_and_pattern() {
    let probe = PatternProbe::new("datetime", "HH:mm").expect("datetime");
    assert_eq!(probe.field_type, ProbeType::Datetime);
    assert_eq!(probe.pattern, "HH:mm");
    // An over-long pattern is not this constructor's to refuse: the catalog
    // answers it in its own slot.
    assert!(PatternProbe::new("date", "d".repeat(MAX_PROBE_PATTERN + 1)).is_ok());
}

#[test]
fn a_type_without_a_pattern_form_is_refused_with_the_name_sanitized() {
    let err = PatternProbe::new("cur\u{202e}rency", "d").expect_err("no pattern form");
    let text = err.to_string();
    assert!(text.contains("has no pattern form"), "{text}");
    assert!(!text.contains('\u{202e}'), "bidi override survived: {text}");
    let long = "x".repeat(500);
    let text = PatternProbe::new(&long, "d")
        .expect_err("unknown")
        .to_string();
    assert!(
        text.len() < 200,
        "the echoed name is bounded: {}",
        text.len()
    );
}

#[test]
fn the_count_cap_is_one_policy_refusing_the_whole_request() {
    assert_eq!(check_probe_count(0), Ok(()));
    assert_eq!(check_probe_count(MAX_PROBES), Ok(()));
    let err = check_probe_count(MAX_PROBES + 1).expect_err("over the cap");
    assert_eq!(
        err,
        ProbeError::TooMany {
            got: MAX_PROBES + 1
        }
    );
    let text = err.to_string();
    assert!(text.contains(&(MAX_PROBES + 1).to_string()), "{text}");
    assert!(text.contains(&MAX_PROBES.to_string()), "{text}");
}
