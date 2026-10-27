//! Unit tests for the `params` ceilings: input size and nesting depth.

use super::*;
use crate::{CoreError, MAX_INPUT_BYTES};

#[test]
fn oversize_params_are_refused_before_the_parse() {
    // `parse_params` does not take the two-pass typed parse, so it is the
    // door most likely to be missed by a cap added at the choke point.
    // Broken syntax + oversize: `TooLarge` proves the order.
    let oversize = format!("{{unterminated\n{}", "#".repeat(MAX_INPUT_BYTES));
    let err = parse_params(&oversize).expect_err("must refuse");
    assert!(
        matches!(err, CoreError::TooLarge { what: "params", .. }),
        "got: {err:?}"
    );
}

#[test]
fn params_at_the_cap_are_still_parsed() {
    let doc = "order: { code: A1 }\n";
    let params = format!("{doc}{}", "#".repeat(MAX_INPUT_BYTES - doc.len()));
    assert_eq!(params.len(), MAX_INPUT_BYTES);
    let value = parse_params(&params).expect("the admitted maximum must parse");
    assert_eq!(
        resolve_path(&value, "order.code").and_then(|v| v.as_str()),
        Some("A1")
    );
}

/// `depth` nested JSON arrays around one number, and as many objects.
fn nested(depth: usize) -> [String; 2] {
    [
        format!("{}1{}", "[".repeat(depth), "]".repeat(depth)),
        format!("{}1{}", "{\"a\":".repeat(depth), "}".repeat(depth)),
    ]
}

#[test]
fn params_at_the_depth_bound_are_read_and_one_past_it_refused() {
    // Params take no door-specific depth bound and no typed read, so the
    // whole door — the tree read, the copy into JSON and dropping both — runs
    // as deep as the YAML door allows.
    for doc in nested(crate::yaml::MAX_DEPTH) {
        let read = crate::yaml::on_a_deep_document_stack(move || parse_params(&doc).map(|_| ()));
        assert!(read.is_ok(), "{read:?}");
    }
    for doc in nested(crate::yaml::MAX_DEPTH + 1) {
        let err = crate::yaml::on_a_deep_document_stack(move || parse_params(&doc).map(|_| ()))
            .expect_err("one level too deep");
        assert!(
            matches!(&err, CoreError::Located { message, .. } if message.as_str().contains("nests deeper than")),
            "{err:?}"
        );
    }
}
