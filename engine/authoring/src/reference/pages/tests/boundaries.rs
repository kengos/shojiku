//! Where the section starts and stops. Each arm is its own claim, because a
//! boundary that reads too little fails OPEN — it reports a clean page by
//! having looked at nothing.

use super::{page, run};

#[test]
fn a_page_with_no_diagnostics_section_contributes_nothing() {
    let text = "# Title\n\n`no_such_code` in ordinary prose.\n\n## Other\n\n`also_missing`\n";
    let (problems, census) = run(text);
    assert_eq!(problems, vec![]);
    assert_eq!(census.pages, 1);
    assert_eq!((census.sections, census.tokens, census.checked), (0, 0, 0));
}

#[test]
fn the_next_h2_ends_the_section() {
    // `page` puts `tail_token` after a `## See also`; if the scan ran on it,
    // it would be reported. Asserted here explicitly rather than relied on.
    let (problems, census) = run(&page("`real_code` is fine."));
    assert_eq!(problems, vec![]);
    assert_eq!(census.checked, 1, "only the in-section token was read");
}

#[test]
fn a_section_that_is_last_on_the_page_is_read_to_the_end() {
    let text = "# Title\n\n## Diagnostics\n\n`real_code`, then `no_such_code` at EOF.";
    let (problems, census) = run(text);
    assert_eq!(
        problems.len(),
        1,
        "the token after the last newline was read"
    );
    assert_eq!(census.checked, 2);
}

#[test]
fn a_sub_heading_does_not_end_the_section() {
    let (problems, census) = run(&page(
        "`real_code`\n\n### Validation\n\n`no_such_code` still counts.",
    ));
    assert_eq!(problems.len(), 1, "the h3 did not close the section");
    assert_eq!(census.checked, 2);
}

#[test]
fn a_fenced_block_inside_the_section_is_excluded() {
    // A YAML sample naming a wire key is not a code claim.
    let (problems, census) = run(&page(
        "```yaml\ntype: text\nfoo: `no_such_code`\n```\n\n`real_code` after the fence.",
    ));
    assert_eq!(problems, vec![]);
    assert_eq!(census.checked, 1, "only the line outside the fence");
}

#[test]
fn an_indented_fence_still_opens_and_closes() {
    let (problems, census) = run(&page("  ```\n  `no_such_code`\n  ```\n\n`real_code`"));
    assert_eq!(problems, vec![]);
    assert_eq!(census.checked, 1);
}

#[test]
fn a_heading_shaped_line_inside_a_fence_does_not_close_the_section() {
    // A markdown sample is content, not structure. Reading it as a heading
    // would end the section silently and audit the rest of the page as if it
    // had none — a fail-OPEN that no problem count could show.
    let (problems, census) = run(&page(
        "```markdown\n## See also\n\n`skipped_token`\n```\n\n`no_such_code` after it.",
    ));
    assert_eq!(
        problems.len(),
        1,
        "the line after the fence is still in scope"
    );
    assert_eq!(census.sections, 1);
    assert_eq!(census.checked, 1, "the sample contributed nothing");
}

#[test]
fn a_fence_that_opens_before_the_section_is_still_closed_inside_it() {
    // Fences are tracked over the whole page, so the state a section starts in
    // is whatever the page left it in — the alternative (resetting at each
    // heading) makes an unterminated fence invisible instead of loud.
    let text =
        "# Title\n\n```\n## Diagnostics\n\n`no_such_code`\n```\n\n## Diagnostics\n\n`real_code`\n";
    let (problems, census) = run(text);
    assert_eq!(problems, vec![], "the fenced heading opened no section");
    assert_eq!(census.sections, 1);
    assert_eq!(census.checked, 1);
}

#[test]
fn a_second_diagnostics_section_on_one_page_is_read_and_counted_once_as_a_table() {
    let text = "## Diagnostics\n\n`real_code`\n\n## Other\n\n`skipped_token`\n\n\
                ## Diagnostics\n\n| Code | Meaning |\n| --- | --- |\n| `other_code` | x |\n";
    let (problems, census) = run(text);
    assert_eq!(problems, vec![], "`skipped_token` sits between the two");
    assert_eq!(census.sections, 2);
    assert_eq!(census.tables, 1, "tables counts PAGES that carry one");
    assert_eq!(census.rows, 1);
}
