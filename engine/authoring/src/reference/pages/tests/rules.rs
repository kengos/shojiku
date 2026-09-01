//! The two rules themselves — what each one refuses, and what it must NOT.

use super::{messages, page, run, Problem};

const HEADER: &str = "| Code | Meaning |\n| --- | --- |";

#[test]
fn a_column_one_code_the_registry_lacks_is_reported_by_page_and_code() {
    let text = page(&format!("{HEADER}\n| `no_such_code` | gone |"));
    let (problems, census) = run(&text);
    assert_eq!(
        problems,
        vec![Problem::UnknownCode {
            page: "p.md".to_owned(),
            code: "no_such_code".to_owned(),
        }]
    );
    assert_eq!(
        messages(&problems),
        vec!["p.md: the registry has no code `no_such_code`"]
    );
    assert_eq!((census.rows, census.occurrences, census.tables), (1, 1, 1));
}

#[test]
fn a_grouped_row_counts_both_codes_and_reports_only_the_unknown_one() {
    // The real shape of the three `repeat_*` rows: one cell, two codes.
    let text = page(&format!("{HEADER}\n| `real_code`, `no_such_code` | both |"));
    let (problems, census) = run(&text);
    assert_eq!(
        problems,
        vec![Problem::UnknownCode {
            page: "p.md".to_owned(),
            code: "no_such_code".to_owned(),
        }]
    );
    assert_eq!(census.rows, 1, "one row");
    assert_eq!(census.occurrences, 2, "two code occurrences");
    assert_eq!(census.distinct, 2, "and the known one still counts");
}

#[test]
fn a_catalog_word_in_column_one_is_still_an_unknown_code() {
    // Column 1 is a code claim, so the second rule's laxer vocabulary must not
    // leak into it — `vertical_rl` is a real wire word and still wrong here.
    let text = page(&format!("{HEADER}\n| `vertical_rl` | a wire value |"));
    let (problems, _) = run(&text);
    assert_eq!(
        problems,
        vec![Problem::UnknownCode {
            page: "p.md".to_owned(),
            code: "vertical_rl".to_owned(),
        }]
    );
}

#[test]
fn an_unknown_underscore_token_in_prose_is_reported() {
    // The `char_grid.md` shape: a whole section of code claims, no table.
    let text = page("The shared codes (`real_code`, `no_such_code`) also apply.");
    let (problems, census) = run(&text);
    assert_eq!(
        messages(&problems),
        vec!["p.md: `no_such_code` is no diagnostic code, capability key or wire word"]
    );
    assert_eq!(census.tables, 0, "a prose section carries no table");
    assert_eq!(census.checked, 2, "both prose tokens were checked");
}

#[test]
fn an_unknown_underscore_token_in_a_later_cell_is_reported() {
    let text = page(&format!("{HEADER}\n| `real_code` | see `no_such_code` |"));
    let (problems, census) = run(&text);
    assert_eq!(
        problems,
        vec![Problem::UnknownToken {
            page: "p.md".to_owned(),
            token: "no_such_code".to_owned(),
        }]
    );
    assert_eq!(census.checked, 1, "column 1 is judged by the first rule");
}

#[test]
fn every_lookup_accepts_a_token_of_its_own() {
    // The false-positive control. Without it the rule is untested in the one
    // direction that would break the build, and the three sets are what the
    // Gate A decision turned on: registry alone reds the committed tree.
    let text = page(
        "codes (`real_code`), capability keys (`image.fit.cover_none`) and \
         wire values (`vertical_rl`) are all acceptable prose.",
    );
    let (problems, census) = run(&text);
    assert_eq!(problems, vec![]);
    assert_eq!(census.checked, 3, "all three were really looked up");
}

#[test]
fn a_token_with_no_underscore_is_out_of_the_second_rules_population() {
    // The filter is the scoping decision, not an accident: `overflow` and
    // `strict` are wire words no set here holds, and they must not red a page.
    let text = page("`overflow` clips, `strict` is the tighter mode.");
    let (problems, census) = run(&text);
    assert_eq!(problems, vec![]);
    assert_eq!(census.checked, 0, "neither token reached a lookup");
    assert_eq!(census.tokens, 0);
}

#[test]
fn an_exempt_comment_skips_the_line_and_the_census_records_it() {
    let text = page("`no_such_code` here <!-- diagnostics-token-exempt: a demo -->");
    let (problems, census) = run(&text);
    assert_eq!(problems, vec![]);
    assert_eq!((census.exempt, census.checked), (1, 0));
}

#[test]
fn an_exempt_comment_does_not_excuse_a_column_one_code_claim() {
    // A waiver may quiet prose; it may not make a code table lie.
    let text = page(&format!(
        "{HEADER}\n| `no_such_code` | x | <!-- diagnostics-token-exempt: no -->"
    ));
    let (problems, _) = run(&text);
    assert_eq!(
        problems,
        vec![Problem::UnknownCode {
            page: "p.md".to_owned(),
            code: "no_such_code".to_owned(),
        }]
    );
}

#[test]
fn a_quoted_token_is_clipped_to_a_stated_bound() {
    let long = "a_".repeat(60);
    let text = page(&format!("`{long}`"));
    let (problems, _) = run(&text);
    let Problem::UnknownToken { token, .. } = &problems[0] else {
        panic!("expected an unknown token, got {problems:?}")
    };
    assert_eq!(token.chars().count(), 64, "clipped, not echoed whole");
    assert!(long.starts_with(token.as_str()));
}
