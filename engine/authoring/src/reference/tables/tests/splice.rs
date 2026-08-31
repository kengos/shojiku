//! The splice: every way a page and a generated block can disagree.
//!
//! A silent no-op is the failure mode worth the most tests here — it leaves a
//! stale table in a file the gate then compares against itself, so it passes.

use crate::reference::tables::{splice, start_marker, SpliceError, CLOSE, OPEN};

fn page(id: &str) -> String {
    format!(
        "# Title\n\nprose\n\n{}\nOLD\n{CLOSE}\n\nmore prose\n",
        start_marker(id)
    )
}

#[test]
fn replaces_only_what_is_between_the_markers() {
    let out = splice(&page("box#keys"), "box#keys", "| a |").expect("the markers are present");
    assert!(out.contains("| a |"), "the new body landed");
    assert!(!out.contains("OLD"), "the old body is gone");
    assert!(
        out.starts_with("# Title\n\nprose\n\n"),
        "the prose above is untouched"
    );
    assert!(
        out.ends_with("\n\nmore prose\n"),
        "the prose below is untouched"
    );
}

#[test]
fn splicing_the_same_body_twice_is_byte_identical() {
    let once = splice(&page("box#keys"), "box#keys", "| a |").expect("first splice");
    let twice = splice(&once, "box#keys", "| a |").expect("second splice");
    assert_eq!(once, twice, "the splice is idempotent");
}

#[test]
fn a_page_with_no_start_marker_fails_rather_than_no_opping() {
    assert_eq!(
        splice("# Title\n\nprose\n", "box#keys", "| a |"),
        Err(SpliceError::NoStart {
            id: "box#keys".into()
        })
    );
}

#[test]
fn a_start_marker_with_no_end_marker_fails() {
    let text = format!("{}\n| a |\n", start_marker("box#keys"));
    assert_eq!(
        splice(&text, "box#keys", "| b |"),
        Err(SpliceError::NoEnd {
            id: "box#keys".into()
        })
    );
}

#[test]
fn an_unterminated_start_marker_fails() {
    // No `-->` ANYWHERE after the start marker: the marker comment itself is
    // malformed. `{CLOSE}` must NOT appear in this fixture — it ends in `-->`
    // itself, so including it let the marker "close" on the wrong comment and
    // this test passed from the missing-END branch instead of the one it
    // exists for. Coverage is what said so: line 89 was never reached.
    let text = format!("{OPEN}box#keys and then nothing\n");
    assert_eq!(
        splice(&text, "box#keys", "| b |"),
        Err(SpliceError::NoEnd {
            id: "box#keys".into()
        })
    );
}

#[test]
fn a_duplicated_id_fails_rather_than_picking_one() {
    let text = format!(
        "{}\n{CLOSE}\n{}\n{CLOSE}\n",
        start_marker("box#keys"),
        start_marker("box#keys")
    );
    assert_eq!(
        splice(&text, "box#keys", "| a |"),
        Err(SpliceError::Duplicated {
            id: "box#keys".into(),
            count: 2
        })
    );
}

#[test]
fn a_body_carrying_the_end_marker_is_refused() {
    // The one hostile input this module has. A cell quoting the end marker
    // would cut the block short and swallow the rest of the page into it.
    let body = format!("| a table row mentioning {CLOSE} |");
    assert_eq!(
        splice(&page("box#keys"), "box#keys", &body),
        Err(SpliceError::MarkerInBody {
            id: "box#keys".into()
        })
    );
}

#[test]
fn a_body_carrying_the_start_marker_is_refused() {
    let body = format!("| a row mentioning {OPEN}other#id --> |");
    assert_eq!(
        splice(&page("box#keys"), "box#keys", &body),
        Err(SpliceError::MarkerInBody {
            id: "box#keys".into()
        })
    );
}

#[test]
fn one_id_is_not_a_prefix_of_another() {
    // `box#keys` must not match `box#keys-2`'s marker. The trailing space in
    // the search needle is what separates them; without it the ids collide
    // exactly where a page carries two tables under one heading, which is the
    // case `grid.md` really has.
    let text = format!("{}\nOLD\n{CLOSE}\n", start_marker("box#keys-2"));
    assert_eq!(
        splice(&text, "box#keys", "| a |"),
        Err(SpliceError::NoStart {
            id: "box#keys".into()
        })
    );
}

#[test]
fn every_error_says_which_table() {
    for error in [
        SpliceError::NoStart { id: "t".into() },
        SpliceError::NoEnd { id: "t".into() },
        SpliceError::Duplicated {
            id: "t".into(),
            count: 2,
        },
        SpliceError::MarkerInBody { id: "t".into() },
    ] {
        assert!(
            error.to_string().contains("`t`"),
            "{error:?} names its table"
        );
    }
}

#[test]
fn an_end_marker_before_the_start_marker_is_not_a_block() {
    // Requirement 10's "reversed order" clause. The search runs forward from
    // the start marker, so a CLOSE that precedes it is not the block's end —
    // and with nothing after, this is `NoEnd` rather than a silently empty
    // splice over the wrong region.
    let text = format!("{CLOSE}\n{}\n", start_marker("box#keys"));
    assert_eq!(
        splice(&text, "box#keys", "| a |"),
        Err(SpliceError::NoEnd {
            id: "box#keys".into()
        })
    );
}
