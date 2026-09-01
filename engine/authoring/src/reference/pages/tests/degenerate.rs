//! Structural input the doc set does not contain today. None of it may panic:
//! a malformed page must produce problems or nothing, and the census must
//! still say what was read.

use super::{audit, messages, run, Census, Problem, Words};

#[test]
fn an_empty_page_and_an_empty_section_are_both_silent() {
    for text in ["", "## Diagnostics\n", "## Diagnostics"] {
        let (problems, census) = run(text);
        assert_eq!(problems, vec![], "{text:?}");
        assert_eq!((census.rows, census.tokens), (0, 0), "{text:?}");
    }
    let (_, census) = run("## Diagnostics\n");
    assert_eq!(census.sections, 1, "an empty section is still a section");
}

#[test]
fn no_pages_at_all_is_an_empty_census() {
    let words = Words::new();
    let (problems, census) = audit(&[], &words.vocabulary());
    assert_eq!(problems, vec![]);
    assert_eq!(census, Census::default());
}

#[test]
fn a_row_shorter_than_its_header_is_read_for_what_it_has() {
    let text = "## Diagnostics\n\n| Code | Meaning |\n| --- | --- |\n| `no_such_code` |\n";
    let (problems, census) = run(text);
    assert_eq!(problems.len(), 1);
    assert_eq!((census.rows, census.occurrences), (1, 1));
}

#[test]
fn an_unterminated_row_keeps_its_tail_under_the_stricter_rule() {
    // No second bar, so there is no "later cell" to demote the claim into.
    let (problems, census) = run("## Diagnostics\n\n| `no_such_code`\n");
    assert_eq!(
        problems,
        vec![Problem::UnknownCode {
            page: "p.md".to_owned(),
            code: "no_such_code".to_owned(),
        }]
    );
    assert_eq!(census.occurrences, 1);
}

#[test]
fn a_table_with_no_separator_row_is_read_the_same_way() {
    let text = "## Diagnostics\n\n| Code | Meaning |\n| `no_such_code` | x |\n";
    let (problems, census) = run(text);
    assert_eq!(problems.len(), 1);
    assert_eq!((census.rows, census.tables), (1, 1));
}

#[test]
fn a_bare_bar_and_a_separator_row_name_nothing() {
    let (problems, census) = run("## Diagnostics\n\n|\n| --- | --- |\n| | |\n");
    assert_eq!(problems, vec![]);
    assert_eq!((census.rows, census.tables, census.occurrences), (0, 0, 0));
}

#[test]
fn an_unterminated_fence_swallows_the_rest_of_the_section() {
    // Pinned rather than merely survived: everything after an unclosed fence
    // is treated as sample text, so a page that opens one silently stops being
    // audited — which is what the committed census exists to catch.
    let (problems, census) = run("## Diagnostics\n\n```\n`no_such_code`\n");
    assert_eq!(problems, vec![]);
    assert_eq!(census.checked, 0);
}

#[test]
fn an_unterminated_backtick_ends_the_scan_of_its_line() {
    let (problems, census) = run("## Diagnostics\n\n`real_code` then `no_such_code\n");
    assert_eq!(problems, vec![]);
    assert_eq!(census.checked, 1);
}

#[test]
fn a_backticked_span_that_is_not_a_name_is_not_a_token() {
    // Prose and code samples live in backticks too; only identifier-shaped
    // runs are names, so `type: text` and `50%` are neither codes nor tokens.
    let (problems, census) = run("## Diagnostics\n\n`type: text` and `50%` and `` ``\n");
    assert_eq!(problems, vec![]);
    assert_eq!((census.tokens, census.checked), (0, 0));
}

#[test]
fn multibyte_prose_does_not_split_a_token() {
    let (problems, census) = run("## Diagnostics\n\n日本語の途中に `no_such_code` があります。\n");
    assert_eq!(problems.len(), 1);
    assert_eq!(census.checked, 1);
}

#[test]
fn every_problem_variant_renders_a_message_naming_the_page() {
    let problems = vec![
        Problem::UnknownCode {
            page: "a.md".to_owned(),
            code: "x_y".to_owned(),
        },
        Problem::UnknownToken {
            page: "b.md".to_owned(),
            token: "z_w".to_owned(),
        },
    ];
    assert_eq!(
        messages(&problems),
        vec![
            "a.md: the registry has no code `x_y`",
            "b.md: `z_w` is no diagnostic code, capability key or wire word",
        ]
    );
    assert!(format!("{:?}", problems[0]).contains("UnknownCode"));
}
