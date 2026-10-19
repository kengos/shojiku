//! Unit tests for the YAML door, grouped by concern.

mod checks;
mod reads;

use super::{parse, YamlError, YamlErrorKind};

/// The refusal `input` gets, asserting it is one of `kind`.
fn refused(input: &str, kind: YamlErrorKind) -> YamlError {
    let err = parse(input).expect_err("the door refuses it");
    assert_eq!(err.kind, kind, "{err:?}");
    err
}
