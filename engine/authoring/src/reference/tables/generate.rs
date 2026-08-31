//! Generating every page's tables, and putting them back.
//!
//! Pure: it takes the page's current bytes and returns what they should be, so
//! the regenerate target and the drift gate run the SAME code and cannot
//! disagree — the mistake the catalog pair already avoids, where a check that
//! merely compares would protect a wrong artifact as faithfully as a right one.
//!
//! The file IO is the binary's, which is also what keeps the write path a
//! compile-time constant rooted at `CARGO_MANIFEST_DIR`: nothing a caller
//! supplies can steer where this writes, because this writes nothing.

use super::render::Registry;
use super::spec::Spec;
use super::{render, splice, Missing, SpliceError};
use std::collections::BTreeSet;
use std::fmt;

/// Why a page could not be regenerated.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// A cell the spec asked for that no source could supply.
    Cell(Missing),
    /// The page and its markers disagree.
    Splice(SpliceError),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Cell(m) => write!(
                f,
                "`{}`: row `{}` has no `{}` and none can be derived",
                m.id, m.key, m.column
            ),
            Self::Splice(e) => write!(f, "{e}"),
        }
    }
}

/// Everything a page needs to be regenerated, held once so the binary and the
/// gate pass the same thing.
pub struct Inputs<'a> {
    pub spec: &'a Spec,
    pub registry: &'a Registry,
}

/// The stems this spec has tables for, so the caller reads only those files.
#[must_use]
pub fn pages(spec: &Spec) -> BTreeSet<String> {
    spec.values().map(|t| t.page.clone()).collect()
}

/// One page's bytes, regenerated.
///
/// # Errors
///
/// Every cell that could not be filled and every marker that could not be
/// found, rather than the first — a page that has just grown a column wants
/// the whole list.
pub fn page(stem: &str, text: &str, inputs: &Inputs<'_>) -> Result<String, Vec<Error>> {
    let mut out = text.to_owned();
    let mut errors = Vec::new();
    for (id, table) in inputs.spec {
        if table.page != stem {
            continue;
        }
        match render(id, table, inputs.registry) {
            Err(missing) => errors.extend(missing.into_iter().map(Error::Cell)),
            Ok(body) => match splice(&out, id, &body) {
                Ok(next) => out = next,
                Err(e) => errors.push(Error::Splice(e)),
            },
        }
    }
    if errors.is_empty() {
        Ok(out)
    } else {
        Err(errors)
    }
}
