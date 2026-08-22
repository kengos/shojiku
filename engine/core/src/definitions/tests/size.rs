//! The input-size bound at the `definitions` door.
//!
//! Split out of the parent suite for the 300-line budget; these are the
//! cases that need a `MAX_INPUT_BYTES`-sized fixture, which is most of
//! their length.

use super::*;

#[test]
fn a_definitions_document_at_the_cap_is_still_parsed() {
    // The other half of the boundary pair, per door: the admitted maximum
    // must WORK, not merely avoid the refusal. Without it, a cap that is
    // one byte too tight rejects a legal document and every "is it
    // refused?" test still passes.
    let doc = "version: 0.2.0\ntype: object\nproperties:\n  a: { type: string }\n";
    let defs = format!("{doc}{}", "#".repeat(crate::MAX_INPUT_BYTES - doc.len()));
    assert_eq!(defs.len(), crate::MAX_INPUT_BYTES);
    parse_definitions(&defs).expect("the admitted maximum must parse");
}

#[test]
fn an_oversize_definitions_document_is_not_re_parsed_by_the_v1_hint() {
    // The door's error arm calls `v1_form_hint`, which parses the whole
    // input again with no bound of its own — so a cap checked only inside
    // `parse_checked` would change which error comes back and nothing else.
    //
    // This fixture is VALID YAML whose top-level key is the one the hint
    // looks for. That is what makes the test fire: if the hint runs, it
    // finds `groups` and returns `Located`, so seeing `TooLarge` proves the
    // second parse did not happen. The sibling test below uses a BROKEN
    // fixture, where the hint returns `None` either way and `TooLarge`
    // would surface whether or not the parse ran — it pins the variant, not
    // the ordering.
    let doc = "groups:\n  - name: a\n";
    let oversize = format!("{doc}{}", "#".repeat(crate::MAX_INPUT_BYTES));
    let err = parse_definitions(&oversize).expect_err("must refuse");
    assert!(
        matches!(
            err,
            CoreError::TooLarge {
                what: "definitions",
                ..
            }
        ),
        "the v1 hint re-parsed the input: {err:?}"
    );
    // Positive control: the same document UNDER the cap does reach the hint,
    // so the assertion above is the cap talking and not a dead code path.
    let hint = parse_definitions(doc).expect_err("the v1 form is refused");
    assert!(matches!(hint, CoreError::Located { .. }), "got: {hint:?}");
}

#[test]
fn an_oversize_definitions_document_is_refused_before_the_parse() {
    let oversize = format!(
        "fields: [unterminated\n{}",
        "#".repeat(crate::MAX_INPUT_BYTES)
    );
    let err = parse_definitions(&oversize).expect_err("must refuse");
    assert!(
        matches!(
            err,
            CoreError::TooLarge {
                what: "definitions",
                ..
            }
        ),
        "got: {err:?}"
    );
}
