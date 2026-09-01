//! What the three lookups are made of, and the one place they are assembled.
//!
//! [`Known::of_this_build`] is that place. The gate proves nothing unless the
//! drift test and `reference-gen` audit against the SAME vocabulary, so
//! neither assembles its own: two hand-built copies would drift, and the one
//! that mattered would be the one nobody ran.
//!
//! The third set is the interesting one. The second rule of [`super`] accepts
//! a token that names a wire key or value, and those words are already in the
//! committed catalog — property names, `enum` values, `oneOf` `const`
//! discriminators and `$defs` shape names — so [`catalog_vocabulary`] reads
//! them out rather than restating them anywhere.
//!
//! That walk is ITERATIVE over an explicit stack. Nothing here recurses, so a
//! deeply nested document costs heap rather than stack, and the audit's "no
//! recursion" posture holds for the catalog half as well as the page scan.

use super::Vocabulary;
use crate::reference::CATALOG;
use crate::CAPABILITIES;
use serde_json::Value;
use shojiku_diagnostics::DiagnosticCode;
use std::collections::BTreeSet;

/// The three sets THIS build defines, owned.
///
/// Held in one place because the gate proves nothing unless the drift test and
/// `reference-gen` audit against the SAME vocabulary — two hand-assembled
/// copies would drift, and the one that mattered would be the one nobody ran.
pub struct Known {
    registry: BTreeSet<String>,
    capabilities: BTreeSet<String>,
    catalog: BTreeSet<String>,
}

impl Known {
    /// Reads `DiagnosticCode::ALL`, [`CAPABILITIES`] and the committed catalog.
    ///
    /// # Panics
    ///
    /// If the embedded catalog is not valid JSON — a compile-time constant, so
    /// this is the same invariant `include_str!` already rests on.
    #[must_use]
    pub fn of_this_build() -> Self {
        let catalog: Value =
            serde_json::from_str(CATALOG).expect("the committed catalog is valid JSON");
        Self {
            registry: DiagnosticCode::ALL
                .iter()
                .map(|code| code.as_str().to_owned())
                .collect(),
            capabilities: CAPABILITIES.iter().map(|k| (*k).to_owned()).collect(),
            catalog: catalog_vocabulary(&catalog),
        }
    }

    /// Borrows the three sets as the audit's input.
    #[must_use]
    pub fn vocabulary(&self) -> Vocabulary<'_> {
        Vocabulary {
            registry: &self.registry,
            capabilities: &self.capabilities,
            catalog: &self.catalog,
        }
    }

    /// How many names each set holds — `(registry, capabilities, catalog)`.
    /// Returned so a drift test can pin the INPUTS as well as the result.
    #[must_use]
    pub fn sizes(&self) -> (usize, usize, usize) {
        (
            self.registry.len(),
            self.capabilities.len(),
            self.catalog.len(),
        )
    }
}

/// Every word the catalog spells, in any of the four positions that name one.
#[must_use]
pub fn catalog_vocabulary(catalog: &Value) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    let mut stack = vec![catalog];
    while let Some(node) = stack.pop() {
        match node {
            Value::Object(map) => {
                for (key, value) in map {
                    collect(key, value, &mut out);
                    stack.push(value);
                }
            }
            Value::Array(items) => stack.extend(items),
            _ => {}
        }
    }
    out
}

/// What one `key: value` pair of a schema object contributes.
fn collect(key: &str, value: &Value, out: &mut BTreeSet<String>) {
    match key {
        "properties" | "$defs" => {
            if let Some(map) = value.as_object() {
                out.extend(map.keys().cloned());
            }
        }
        "enum" => {
            if let Some(items) = value.as_array() {
                out.extend(items.iter().filter_map(Value::as_str).map(str::to_owned));
            }
        }
        "const" => {
            if let Some(word) = value.as_str() {
                out.insert(word.to_owned());
            }
        }
        _ => {}
    }
}
