//! Unit tests for `{key}` / `{key:format}` segmentation and the
//! charset-mistake scan.

use super::*;

#[test]
fn plain_text_is_one_literal() {
    assert_eq!(
        parse_segments("hello world"),
        vec![Segment::Literal("hello world".into())]
    );
}

#[test]
fn parses_expression() {
    assert_eq!(
        parse_segments("code: {order.code}"),
        vec![
            Segment::Literal("code: ".into()),
            Segment::Expr {
                key: "order.code".into(),
                format: None
            },
        ]
    );
}

#[test]
fn parses_expression_with_format() {
    assert_eq!(
        parse_segments("{amount.total:currency}!"),
        vec![
            Segment::Expr {
                key: "amount.total".into(),
                format: Some("currency".into())
            },
            Segment::Literal("!".into()),
        ]
    );
}

#[test]
fn escaped_braces_are_literal() {
    assert_eq!(
        parse_segments("{{not_a_key}}"),
        vec![Segment::Literal("{not_a_key}}".into())]
    );
}

#[test]
fn unclosed_brace_is_literal() {
    assert_eq!(
        parse_segments("broken {order.code"),
        vec![Segment::Literal("broken {order.code".into())]
    );
}

#[test]
fn japanese_around_expressions() {
    assert_eq!(
        parse_segments("合計 {amount.total_in_tax:currency} です"),
        vec![
            Segment::Literal("合計 ".into()),
            Segment::Expr {
                key: "amount.total_in_tax".into(),
                format: Some("currency".into())
            },
            Segment::Literal(" です".into()),
        ]
    );
}

#[test]
fn invalid_characters_inside_braces_are_literal() {
    assert_eq!(
        parse_segments("{a b}"),
        vec![Segment::Literal("{a b}".into())]
    );
    assert_eq!(
        parse_segments("{key:bad char} tail"),
        vec![Segment::Literal("{key:bad char} tail".into())]
    );
}

#[test]
fn empty_key_is_literal() {
    assert_eq!(parse_segments("{}"), vec![Segment::Literal("{}".into())]);
    assert_eq!(
        parse_segments("{:fmt}"),
        vec![Segment::Literal("{:fmt}".into())]
    );
}

#[test]
fn scan_reports_a_non_ascii_key() {
    assert_eq!(scan_suspect_keys("和文キー: {品名}"), vec!["品名"]);
    assert_eq!(
        scan_suspect_keys("{品名:currency} と {顧客.担当}"),
        vec!["品名:currency", "顧客.担当"]
    );
}

#[test]
fn scan_leaves_valid_expressions_alone() {
    assert!(scan_suspect_keys("code: {order.code}").is_empty());
    assert!(scan_suspect_keys("{amount.total:currency}").is_empty());
}

#[test]
fn scan_leaves_yaml_snippets_and_ascii_mistakes_alone() {
    // A code sample in a showcase panel: whitespace disqualifies it.
    assert!(scan_suspect_keys("box: { h: 24 }").is_empty());
    assert!(scan_suspect_keys("style: { textAlign: center }").is_empty());
    // ASCII-only malformed bodies are not charset mistakes.
    assert!(scan_suspect_keys("{:fmt}").is_empty());
    assert!(scan_suspect_keys("{a-b}").is_empty());
    assert!(scan_suspect_keys("{}").is_empty());
    // `a:b:c` breaks the two-part grammar but stays ASCII.
    assert!(scan_suspect_keys("{a:b:c}").is_empty());
}

#[test]
fn scan_skips_the_escape_and_unclosed_runs() {
    assert!(scan_suspect_keys("{{品名}}").is_empty());
    assert!(scan_suspect_keys("unclosed {品名").is_empty());
}

#[test]
fn scan_drops_an_over_long_body() {
    let long: String = "品".repeat(MAX_SUSPECT_LEN + 1);
    assert!(scan_suspect_keys(&format!("{{{long}}}")).is_empty());
    let at_cap: String = "品".repeat(MAX_SUSPECT_LEN);
    assert_eq!(scan_suspect_keys(&format!("{{{at_cap}}}")), vec![at_cap]);
}

#[test]
fn scan_terminates_on_degenerate_repeat_runs() {
    // Each `{` starts a candidate that consumes from the SAME iterator,
    // so a hostile run stays linear and reports nothing.
    assert!(scan_suspect_keys(&"{".repeat(5_000)).is_empty());
    assert!(scan_suspect_keys(&"{品".repeat(5_000)).is_empty());
    // `{品}` repeated DOES close each time; every body is reported once.
    assert_eq!(scan_suspect_keys(&"{品}".repeat(100)).len(), 100);
}
