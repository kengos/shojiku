//! The annotation layer's RULE: every catalog node carries prose, and every
//! annotation names a real node.
//!
//! The catalog derives its STRUCTURE from the parser, which makes drift
//! structurally impossible. Prose cannot be derived, so the thing that keeps
//! it honest is this audit: a key added to the wire arrives un-annotated and
//! is reported by name rather than shipping as a silent gap.
//!
//! Three kinds of node exist, and the annotation file addresses each with a
//! dotted spelling: a named shape (`Style`), one of its properties
//! (`Style.fontSize`), and — because the wire's tagged unions are emitted as
//! `oneOf` branches rather than named shapes — a DISCRIMINATED branch and its
//! own keys (`Item.text`, `Item.text.data`). That third kind is not an extra:
//! the 15 item types and the two body kinds live only there, so a node set
//! built from named shapes alone would be complete over 279 nodes while
//! `type: text` had no prose at all.
//!
//! Two corners of the unions are nodes too, because an agent reading the
//! catalog reads every PROPERTY, and an undescribed one is a gap whatever the
//! parent's prose says. A branch's own discriminator is `Item.text.type`. A
//! branch with no discriminator — the alternative FORM of a value shape
//! (`BorderColor`'s per-side map, `PageSize`'s `{ w, h }`, `PointSpec`'s anchor
//! arm) — has no name of its own, so its keys are addressed through the shape:
//! `PageSize.w`, `PointSpec.item`. That spelling is unambiguous only while no
//! two branches of a shape share a key and no key shares a discriminated
//! branch's name, which the gate pins by refusing a duplicate node.
//!
//! Neither a shape name, a property name nor a discriminator contains a dot,
//! and no shape carries both `oneOf` and `properties`, so a dotted spelling
//! splits one way only. A NESTED file shape was rejected for a concrete reason: three
//! wire keys are literally named `description`, so a
//! `{ description:, properties: }` envelope would collide with the data it
//! describes.
//!
//! **Everything here is `pub` for a reason worth stating, because nothing
//! outside this crate calls it yet.** The rule's only callers are the gate's
//! own tests and — for [`parse`] — the feature-gated generator, and a
//! `pub(crate)` item reached only from `#[cfg(test)]` code is dead code in an
//! ordinary build, which `clippy -D warnings` refuses. So the choice is
//! between a public surface and an `#[allow]`, and a public one is honest:
//! "is the reference complete?" is a question a host could reasonably ask, and
//! the module already exposes [`super::CATALOG`] to the site the same way.
//!
//! This module is DEFAULT-feature on purpose. The merge that writes prose into
//! the artifact needs the schema derive and lives behind `schema`, outside the
//! workspace coverage run; the rule that says the result is complete must be
//! inside it, so every failure leg is reachable from a synthetic pair.

use serde_json::Value;
use shojiku_core::yaml::YamlError;
use std::collections::BTreeMap;
use std::fmt;

mod closed;

pub use closed::{closed_union, closed_values, literal_values};

/// The shortest annotation that is not a placeholder.
///
/// A stub ("TODO", "the width") satisfies "has an annotation" while telling an
/// author nothing, which is the shape a burn-down leaves behind. The bar is
/// deliberately low — it refuses a placeholder, it does not judge prose.
const MIN_LEN: usize = 24;

/// One way the annotation set and the catalog disagree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Problem {
    /// A catalog node with no annotation.
    Missing(String),
    /// An annotation naming something the catalog does not define.
    Unknown(String),
    /// A node spelling that addresses more than one key, so one annotation
    /// would describe both.
    Ambiguous(String),
    /// An annotation that is empty or only whitespace.
    Blank(String),
    /// An annotation too short to be prose.
    Stub { node: String, len: usize },
    /// A closed value set whose prose does not name one of its values.
    UnnamedValue { shape: String, value: String },
}

impl fmt::Display for Problem {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Missing(node) => write!(f, "`{node}` has no annotation"),
            Self::Unknown(node) => {
                write!(f, "annotation `{node}` names no node in the catalog")
            }
            Self::Ambiguous(node) => {
                write!(f, "`{node}` addresses more than one key in the catalog")
            }
            Self::Blank(node) => write!(f, "`{node}` is annotated with blank text"),
            Self::Stub { node, len } => {
                write!(f, "`{node}` is annotated with {len} chars — a stub")
            }
            Self::UnnamedValue { shape, value } => write!(
                f,
                "`{shape}` accepts `{value}` and its annotation never names it"
            ),
        }
    }
}

/// Parses the embedded annotation file.
///
/// Fallible rather than panicking so the caller decides: the generator turns a
/// failure into a message naming `make reference:generate`, and the gate
/// reports it as a test failure.
///
/// # Errors
///
/// Returns the YAML door's ([`shojiku_core::yaml`]) refusal when the file is
/// not a flat map of string to string, or is not a document the door reads.
pub fn parse(src: &str) -> Result<BTreeMap<String, String>, YamlError> {
    shojiku_core::yaml::from_str(src)
}

/// Every node the catalog expects prose for, in catalog order.
///
/// A shape, each of its properties as `Shape.property`, then each
/// discriminated `oneOf` branch as `Shape.<discriminator>` with its own keys
/// below it, then the keys of each anonymous branch as `Shape.property`. The two roots (`template`, `definitions`) are `$ref`s into
/// `$defs`, so they own no prose of their own.
#[must_use]
pub fn nodes(catalog: &Value) -> Vec<String> {
    let mut out = Vec::new();
    for (shape, schema) in defs(catalog) {
        out.push(shape.clone());
        for property in properties(schema).keys() {
            out.push(format!("{shape}.{property}"));
        }
        for (name, branch) in branches(schema) {
            out.push(format!("{shape}.{name}"));
            for property in properties(branch).keys() {
                out.push(format!("{shape}.{name}.{property}"));
            }
        }
        for branch in anonymous(schema) {
            for property in properties(branch).keys() {
                out.push(format!("{shape}.{property}"));
            }
        }
    }
    out
}

/// The key whose `const` names a tagged union's branch.
const DISCRIMINATOR: &str = "type";

/// A shape's discriminated `oneOf` branches, paired with the literal that
/// selects each.
///
/// A branch with no discriminator is not here: [`anonymous`] returns those.
pub fn branches(schema: &Value) -> Vec<(String, &Value)> {
    schema
        .get("oneOf")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|branch| Some((discriminator(branch)?, branch)))
        .collect()
}

/// A shape's `oneOf` branches that carry keys but no discriminator — the
/// alternative object FORM of a value shape, whose keys are addressed through
/// the shape itself.
pub fn anonymous(schema: &Value) -> Vec<&Value> {
    schema
        .get("oneOf")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|branch| branch.get("properties").is_some() && discriminator(branch).is_none())
        .collect()
}

/// How many anonymous branches the catalog holds, and how many keys they hold
/// between them.
///
/// Pinned by the gate so a new object form of a value shape is a visible
/// change: its keys are addressed through the shape, and a key it shares with
/// a sibling form would make that address ambiguous.
#[must_use]
pub fn anonymous_branches(catalog: &Value) -> (usize, usize) {
    let mut count = 0;
    let mut keys = 0;
    for (_, schema) in defs(catalog) {
        for branch in anonymous(schema) {
            count += 1;
            keys += properties(branch).len();
        }
    }
    (count, keys)
}

/// The literal a branch's discriminator key is pinned to, if it has one.
fn discriminator(branch: &Value) -> Option<String> {
    branch
        .get("properties")?
        .get(DISCRIMINATOR)?
        .get("const")?
        .as_str()
        .map(str::to_owned)
}

/// Reports every disagreement between the catalog and the annotations.
///
/// An empty result is the gate. The order is stable — catalog order for the
/// node-driven problems, then annotation order for the unknown ones — so a
/// failure message reads the same on every run.
#[must_use]
pub fn audit(catalog: &Value, annotations: &BTreeMap<String, String>) -> Vec<Problem> {
    let mut problems = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for node in nodes(catalog) {
        if !seen.insert(node.clone()) {
            problems.push(Problem::Ambiguous(node));
            continue;
        }
        match annotations.get(&node).map(String::as_str) {
            None => problems.push(Problem::Missing(node)),
            Some(text) if text.trim().is_empty() => problems.push(Problem::Blank(node)),
            Some(text) if text.trim().chars().count() < MIN_LEN => {
                let len = text.trim().chars().count();
                problems.push(Problem::Stub { node, len });
            }
            Some(_) => {}
        }
    }
    for node in annotations.keys() {
        if !seen.contains(node) {
            problems.push(Problem::Unknown(node.clone()));
        }
    }
    problems.extend(unnamed_values(catalog, annotations));
    problems
}

/// Every literal a shape accepts must be named in its prose.
///
/// Two reasons, and the second is why this keys on [`literal_values`] rather
/// than on the strictly-closed set. A closed set is only information if the
/// prose says what the values ARE — "absence is information" is the property
/// the format was chosen for, and it is worth nothing to a reader who cannot
/// see the set. And this is the one guard available against a description that
/// errs WIDE: a derived schema describes the Rust shape, so prose is where the
/// accepted set gets stated, and a variant added later leaves the sentence
/// behind.
///
/// A union that ALSO takes a non-literal form still owes its literals. Keying
/// this on the closed set let `PageSize` — eight named papers or a `{ w, h }`
/// map — ship a description reading "the ISO A series, the JIS B series and
/// the North American sizes", which invites `A2` and `Ledger`. Neither
/// parses.
fn unnamed_values(catalog: &Value, annotations: &BTreeMap<String, String>) -> Vec<Problem> {
    let mut problems = Vec::new();
    for (shape, schema) in defs(catalog) {
        let Some(values) = literal_values(schema) else {
            continue;
        };
        let Some(text) = annotations.get(shape) else {
            continue;
        };
        for value in values {
            if !text.contains(&format!("`{value}`")) {
                problems.push(Problem::UnnamedValue {
                    shape: shape.clone(),
                    value,
                });
            }
        }
    }
    problems
}

/// The catalog's named shapes, or nothing when the document has no `$defs`.
fn defs(catalog: &Value) -> impl Iterator<Item = (&String, &Value)> {
    catalog
        .get("$defs")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
}

/// A shape's own properties. A shape that declares none (an enum, a union)
/// contributes only itself.
fn properties(schema: &Value) -> &serde_json::Map<String, Value> {
    static EMPTY: std::sync::LazyLock<serde_json::Map<String, Value>> =
        std::sync::LazyLock::new(serde_json::Map::new);
    schema
        .get("properties")
        .and_then(Value::as_object)
        .unwrap_or(&EMPTY)
}
