//! Unit tests for the YAML/JSON input-sanitation guard.

use super::*;

fn parse(s: &str) -> serde_yaml::Value {
    serde_yaml::from_str(s).expect("yaml")
}

#[test]
fn finite_documents_pass() {
    assert!(ensure_finite(&parse("a: {b: [1, 2.5, -3]}"), "doc").is_ok());
    assert!(ensure_finite(&parse("plain string"), "doc").is_ok());
}

#[test]
fn nan_and_inf_are_rejected_at_any_depth() {
    assert!(ensure_finite(&parse("a: .nan"), "doc").is_err());
    assert!(ensure_finite(&parse("a: [1, {b: .inf}]"), "doc").is_err());
    assert!(ensure_finite(&parse("a: -.inf"), "doc").is_err());
}

#[test]
fn the_cap_is_sixteen_mebibytes() {
    // The boundary tests below are written RELATIVE to the constant, so
    // they hold for ANY value of it — including a value nobody chose.
    // This is the one assertion that pins the number itself, and it is
    // the number the CHANGELOG and the docs quote.
    assert_eq!(MAX_INPUT_BYTES, 16 * 1024 * 1024);
}

#[test]
fn at_the_cap_is_admitted_and_one_byte_past_it_is_refused() {
    // The boundary pair. `MAX_INPUT_BYTES` is the largest ACCEPTED
    // size, so the admitted maximum must parse rather than merely
    // "not panic" — an off-by-one here silently rejects a legal
    // document.
    let filler = "#".repeat(MAX_INPUT_BYTES - "a: 1\n".len());
    let at_cap = format!("a: 1\n{filler}");
    assert_eq!(at_cap.len(), MAX_INPUT_BYTES);
    assert!(ensure_bounded_size(&at_cap, "doc").is_ok());

    let past_cap = format!("{at_cap}#");
    let err = ensure_bounded_size(&past_cap, "doc").expect_err("one byte over");
    // `matches!` rather than a let-else: the else arm's `panic!` is a
    // line no passing test can reach, and the 100%-lines gate counts
    // test code too.
    assert!(
        matches!(
            err,
            CoreError::TooLarge { what: "doc", bytes, limit }
                if bytes == MAX_INPUT_BYTES + 1 && limit == MAX_INPUT_BYTES
        ),
        "got: {err:?}"
    );
}

#[test]
fn the_size_refusal_quotes_none_of_the_input() {
    // A refusal must not echo a document nobody vetted. The rendered
    // message is two numbers and the artifact name — the marker below
    // is in the input and must not reach the message.
    let marker = "SECRET-\u{1b}]0;pwned\u{7}";
    let oversize = format!("{marker}{}", "#".repeat(MAX_INPUT_BYTES));
    let err = ensure_bounded_size(&oversize, "template").expect_err("over");
    let rendered = err.to_string();
    assert!(!rendered.contains("SECRET"), "message: {rendered}");
    assert!(!rendered.contains('\u{1b}'), "message: {rendered}");
    assert!(rendered.contains("template"));
    // …and the same holds through the diagnostic the GUI reads.
    let diag = err.to_diagnostic();
    let args = format!("{:?}", diag);
    assert!(!args.contains("SECRET"), "diagnostic: {args}");
}

/// The YAML parser's OWN limits, pinned. Nothing in this crate enforces
/// either one — `serde_yaml` (over unsafe-libyaml) refuses first — which
/// is exactly why they are worth a test: swap the parser and these are
/// the two holes that would reopen with no other gate noticing.
#[test]
fn the_yaml_parser_refuses_runaway_nesting_before_the_finiteness_walk() {
    // `has_non_finite` recurses per nesting level with no bound of its
    // own. It is safe only because nothing deeper than this ever
    // reaches it.
    let deep = format!("{}x{}", "[".repeat(128), "]".repeat(128));
    assert!(
        serde_yaml::from_str::<serde_yaml::Value>(&deep).is_ok(),
        "128 is the admitted maximum"
    );
    let deeper = format!("{}x{}", "[".repeat(129), "]".repeat(129));
    assert!(serde_yaml::from_str::<serde_yaml::Value>(&deeper).is_err());
    // A pathological-but-legal document still walks fine.
    assert!(ensure_finite(&parse(&deep), "doc").is_ok());
}

#[test]
fn the_yaml_parser_refuses_runaway_alias_expansion_at_this_input_size() {
    // The billion-laughs shape at ~200 source bytes. The limit this
    // pins is REAL but it is not a constant: serde_yaml's repetition
    // budget is `events.len() * 100`, so it scales with the input and
    // a padded document buys a proportionally bigger bomb (see the
    // module doc). What this test pins is that the budget exists at
    // all and that a small bomb cannot walk past it — not that
    // amplification is bounded in general.
    let laughs = |levels: usize| {
        let mut src = String::from("a0: &a0 \"x\"\n");
        for i in 1..=levels {
            let prev = format!("*a{}", i - 1);
            let refs = vec![prev; 10].join(", ");
            src.push_str(&format!("a{i}: &a{i} [{refs}]\n"));
        }
        src.push_str(&format!("root: *a{levels}\n"));
        src
    };
    // Positive control: the shape itself parses, so the refusal below
    // is the LIMIT talking and not a syntax error in the fixture.
    assert!(serde_yaml::from_str::<serde_yaml::Value>(&laughs(3)).is_ok());
    let err = serde_yaml::from_str::<serde_yaml::Value>(&laughs(4))
        .expect_err("the repetition limit must refuse this");
    assert!(err.to_string().contains("repetition"), "got: {err}");
}

#[test]
fn tagged_values_are_inspected() {
    assert!(ensure_finite(&parse("a: !custom .inf"), "doc").is_err());
    assert!(ensure_finite(&parse("a: !custom 1.5"), "doc").is_ok());
}
