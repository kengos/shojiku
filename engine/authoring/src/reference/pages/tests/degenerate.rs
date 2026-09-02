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
        Problem::CodeShaped {
            page: "c.md".to_owned(),
            token: "p_q".to_owned(),
        },
    ];
    assert_eq!(
        messages(&problems),
        vec![
            "a.md: the registry has no code `x_y`",
            "b.md: `z_w` is no diagnostic code, capability key or wire word",
            "c.md: `p_q` is spelled like a diagnostic code and the engine defines \
             no such code, capability key or wire word — reword it, or add it to \
             the excused list with its reason",
        ]
    );
    assert!(format!("{:?}", problems[0]).contains("UnknownCode"));
}

/// The third rule reads OUTSIDE the section, which is most of a page, so its
/// cost and its echo bound are worth pinning on hostile shapes rather than on
/// the corpus. One pass, no backtracking, and a name quoted back is clipped at
/// the same 64 chars the other two rules use.
#[test]
fn the_prose_rule_stays_linear_and_clips_what_it_quotes() {
    let long = "a_".repeat(400) + "b";
    let (problems, census) = run(&format!("# T\n\nprose `{long}`\n"));

    assert_eq!(census.outside, 1, "one token, however long");
    assert_eq!(problems.len(), 1);
    let Problem::CodeShaped { token, .. } = &problems[0] else {
        panic!("expected the prose rule: {problems:?}");
    };
    assert_eq!(token.chars().count(), 64, "clipped like every other echo");

    // Many backticks on one line: the walk advances past each pair it finds
    // and never re-scans, so this is linear rather than quadratic.
    let many = "`a_b` ".repeat(500);
    let (problems, census) = run(&format!("# T\n\n{many}\n"));
    assert_eq!(census.outside, 500);
    assert_eq!(problems.len(), 500, "each occurrence is its own claim");

    // An UNTERMINATED backtick ends the scan of that line rather than running
    // off it: the trailing text is not a token.
    let (problems, census) = run("# T\n\nprose `a_b` and an open `c_d\n");
    assert_eq!(census.outside, 1, "only the closed pair is a token");
    assert_eq!(problems.len(), 1);
}
