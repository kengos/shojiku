//! Unit tests for the `params` input-size ceiling.

use super::*;
use crate::{CoreError, MAX_INPUT_BYTES};

#[test]
fn oversize_params_are_refused_before_the_parse() {
    // `parse_params` does NOT go through `parse_checked`, so it is the
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
